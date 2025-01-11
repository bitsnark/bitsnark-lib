import logging
import decimal
import json
import time
import typing
import urllib.parse
from decimal import Decimal

from bitcointx.core import CTransaction, CMutableTransaction, COutPoint, CTxOut
from bitcointx.wallet import CCoinAddress
import requests


logger = logging.getLogger(__name__)


class ScanTxOutSetUtxo(typing.TypedDict):
    txid: str
    vout: int
    scriptPubKey: str
    desc: str
    amount: Decimal
    height: int


class ScanTxOutSetResponse(typing.TypedDict):
    success: bool
    txouts: int
    height: int
    bestblock: str
    unspents: list[ScanTxOutSetUtxo]
    total_amount: Decimal


class JSONRPCError(requests.HTTPError):
    def __init__(self, *, message, code=None, request=None, response=None, jsonrpc_data=None):
        self.code = code
        self.message = message
        super().__init__(
            {
                "message": message,
                "code": code,
                "jsonrpc_data": jsonrpc_data,
            },
            request=request,
            response=response,
        )


class TestMempoolAcceptFailure(Exception):
    def __init__(self, resp: dict | list[dict]):
        self.resp = resp
        if not isinstance(resp, dict):
            resp = resp[0]
        self.allowed = resp['allowed']
        self.reason = resp['reject-reason']
        self.txid = resp['txid']
        self.wtxid = resp.get('wtxid')
        super().__init__(self.reason)


class BitcoinRPC:
    """Requests-based RPC client, because bitcointx.rpc.RPCCaller is riddled with cryptic http errors"""
    url: str

    def __init__(self, url: str):
        self._id_count = 0
        self.url = url  # so that it can be retrieved from this

        # parse the url
        urlparts = urllib.parse.urlparse(url)
        self._auth = (urlparts.username, urlparts.password) if (urlparts.username or urlparts.password) else None
        if urlparts.port:
            netloc = f"{urlparts.hostname}:{urlparts.port}"
        else:
            netloc = urlparts.hostname
        self._url = urllib.parse.urlunparse(
            urllib.parse.ParseResult(
                scheme=urlparts.scheme,
                netloc=netloc,
                path=urlparts.path,
                params=urlparts.params,
                query=urlparts.query,
                fragment=urlparts.fragment,
            )
        )

    # Interface to any service call
    def call(self, service_name: str, *args: typing.Any):
        return self._jsonrpc_call(service_name, args)

    def _jsonrpc_call(self, method, params):
        self._id_count += 1

        jsonrpc_data = {
            "jsonrpc": "2.0",
            "id": self._id_count,
            "method": method,
            "params": params,
        }
        postdata = json.dumps(
            jsonrpc_data,
            cls=DecimalJSONEncoder,
        )
        response = requests.post(
            self._url,
            data=postdata,
            auth=self._auth,
            headers={
                "Content-Type": "application/json",
            },
        )

        # Don't raise here, we want sane error messages
        # try:
        #     response.raise_for_status()
        # except requests.HTTPError as e:
        #     raise JSONRPCError(
        #         message=str(e),
        #         response=response,
        #         jsonrpc_data=jsonrpc_data,
        #     ) from e

        try:
            response_json = json.loads(
                response.text,
                parse_float=Decimal,
            )
        except json.JSONDecodeError as e:
            raise JSONRPCError(
                message=str(e),
                response=response,
                jsonrpc_data=jsonrpc_data,
            ) from e
        error = response_json.get("error")
        if error is not None or not response.ok:
            if isinstance(error, dict):
                raise JSONRPCError(
                    message=error["message"],
                    code=error["code"],
                    response=response,
                    jsonrpc_data=jsonrpc_data,
                )
            raise JSONRPCError(
                message=str(error),
                response=response,
                jsonrpc_data=jsonrpc_data,
            )
        if "result" not in response_json:
            raise JSONRPCError(
                message="No result in response",
                response=response,
                jsonrpc_data=jsonrpc_data,
            )
        return response_json["result"]

    def mine_blocks(self, num: int = 1, to_address: str = None, *, sleep: float = 1.1) -> list[str]:
        # Regtest only: mine blocks
        if to_address is None:
            # Use a random address if none is provided (not important)
            to_address = "bcrt1qtxysk2megp39dnpw9va32huk5fesrlvutl0zdpc29asar4hfkrlqs2kzv5"
        ret = self.call("generatetoaddress", num, to_address)
        if sleep:
            # Sleep here by default, otherwise the tap nodes will not have time to process the block(s)
            time.sleep(sleep)
        return ret

    def scantxoutset(
        self,
        *,
        address: str | CCoinAddress,
    ) -> ScanTxOutSetResponse:
        desc = f"addr({address})"
        response = self.call("scantxoutset", "start", [
            desc,
        ])
        logger.info('scantxoutset: %s', response)
        return response

    def get_address_balance(
        self,
        address: str | CCoinAddress,
    ) -> Decimal:
        response = self.scantxoutset(
            address=address,
        )
        return response["total_amount"]

    def find_vout_index(self, txid: str, address: str | CCoinAddress) -> int:
        candidates = []
        tx = self.call("getrawtransaction", txid, True)
        for out in tx["vout"]:
            if out["scriptPubKey"]["address"] == str(address):
                candidates.append(out["n"])
        if not candidates:
            raise LookupError(f"No outputs to {address} in tx {txid}")
        if len(candidates) > 1:
            raise LookupError(f"Multiple outputs to {address} in tx {txid}: {candidates}")
        return candidates[0]

    def test_mempoolaccept(self, tx: str | bytes | CTransaction | CMutableTransaction) -> None:
        if isinstance(tx, (CTransaction, CMutableTransaction)):
            tx = tx.serialize().hex()
        elif isinstance(tx, bytes):
            tx = tx.hex()
        else:
            if not isinstance(tx, str):
                raise ValueError("tx must be either a CTransaction, CMutableTransaction, bytes, or str")
        response = self.call("testmempoolaccept", [tx])
        if not response[0]["allowed"]:
            raise TestMempoolAcceptFailure(response[0])

    def get_wallet_transaction(self, txid: str) -> CTransaction:
        """Get a transaction from the wallet"""
        tx_response = self.call("gettransaction", txid)
        tx_hex = tx_response["hex"]
        return CTransaction.deserialize(bytes.fromhex(tx_hex))

    def get_output(self, outpoint: COutPoint) -> CTxOut:
        """Get output, for example for spent_outputs. Only works if the RPC points to a wallet url"""
        txid = outpoint.hash[::-1].hex()
        tx = self.get_wallet_transaction(txid)
        return tx.vout[outpoint.n]


class DecimalJSONEncoder(json.JSONEncoder):
    # Forked from bitcointx/rpc.py... seems like f'{somedecimal:.08f}' no longer works for python3.11?
    def default(self, o: typing.Any) -> typing.Any:
        if isinstance(o, decimal.Decimal):
            r = float(o)
            if f"{r:.08f}" != f"{o:.8f}":
                raise TypeError(
                    f"value {o!r} lost precision beyond acceptable range "
                    f"when converted to float: {r:.08f} != {o:.8f}"
                )
            return r
        return super().default(o)

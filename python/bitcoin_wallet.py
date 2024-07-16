from decimal import Decimal
import logging
from .bitcoin_rpc import BitcoinRPC


logger = logging.getLogger(__name__)


class BitcoinWallet:
    name: str
    rpc: BitcoinRPC
    addresses: list[str]

    def __init__(self, *, name: str, rpc: BitcoinRPC):
        self.name = name
        self.rpc = rpc
        self.addresses = []

    @classmethod
    def create(
        cls,
        *,
        name: str,
        rpc_base_url: str,
        blank: bool = False,
        disable_private_keys: bool = False,
    ):
        base_rpc = BitcoinRPC(rpc_base_url)
        base_rpc.call(
            "createwallet",
            name,
            disable_private_keys,
            blank,
        )

        logger.info("Created wallet %s", name)
        wallet = cls(
            name=name,
            rpc=BitcoinRPC(f"{rpc_base_url}/wallet/{name}"),
        )

        return wallet

    def get_new_address(self) -> str:
        address = self.rpc.call("getnewaddress")
        self.addresses.append(address)
        return address

    def get_receiving_address(self) -> str:
        if self.addresses:
            return self.addresses[0]
        return self.get_new_address()

    def mine(self, blocks=1, address=None):
        if address is None:
            address = self.get_receiving_address()
        return self.rpc.call("generatetoaddress", blocks, address)

    def get_balance_btc(self) -> Decimal:
        return self.rpc.call("getbalance")

    def send(self, *, amount_btc: Decimal | int, receiver: str):
        return self.rpc.call("sendtoaddress", receiver, amount_btc)

    def import_address(self, address: str):
        self.rpc.call("importaddress", address)
        self.addresses.append(address)

from bitcointx.wallet import CCoinAddress
from decimal import Decimal
import logging
from bitsnark.btc.rpc import BitcoinRPC, JSONRPCError


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

    @classmethod
    def load_or_create(
        cls,
        *,
        name: str,
        rpc_base_url: str,
        blank: bool = False,
        disable_private_keys: bool = False,
    ):
        base_rpc = BitcoinRPC(rpc_base_url)

        create = True
        wallets = base_rpc.call("listwallets")

        if name in wallets:
            logger.info("Using already loaded wallet %s", name)
            create = False
        else:
            try:
                base_rpc.call("loadwallet", name)
                logger.info("Loaded wallet %s", name)
                create = False
            except JSONRPCError:
                pass  # create = True

        if create:
            return cls.create(
                name=name,
                rpc_base_url=rpc_base_url,
                blank=blank,
                disable_private_keys=disable_private_keys,
            ), True
        else:
            return cls(
                name=name,
                rpc=BitcoinRPC(f"{rpc_base_url}/wallet/{name}"),
            ), False

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

    def send(self, *, amount_btc: Decimal | int, receiver: str | CCoinAddress):
        return self.rpc.call("sendtoaddress", str(receiver), amount_btc)

    def import_address(self, address: str | CCoinAddress):
        if not isinstance(address, str):
            address = str(address)
        self.rpc.call("importaddress", address)
        self.addresses.append(address)

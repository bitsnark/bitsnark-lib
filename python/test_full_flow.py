import bitcointx
from .docker_compose import start_stop_docker_compose
from .bitcoin_rpc import BitcoinRPC
from .bitcoin_wallet import BitcoinWallet

RPC_BASE_URL = "http://rpcuser:rpcpassword@localhost:18443"

@start_stop_docker_compose
def main():
    bitcointx.select_chain_params("bitcoin/regtest")
    rpc = BitcoinRPC(RPC_BASE_URL)
    print("Creating test wallet")
    wallet = BitcoinWallet.create(name="test_wallet", rpc_base_url=RPC_BASE_URL)
    print("Wallet address:", wallet.get_receiving_address())
    print("Mining initial balance and enabling segwit")
    rpc.call("generatetoaddress", 500, wallet.get_receiving_address())
    print("Wallet balance (BTC)", wallet.get_balance_btc())


if __name__ == '__main__':
    main()

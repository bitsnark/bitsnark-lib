from threading import Thread
from .bitcoin_rpc import BitcoinRPC
import time


# regtest helpers for mining
REGTEST_MINING = False
REGTEST_MINING_THREAD: Thread | None = None


def start_mining(rpc: BitcoinRPC, *, interval: float = 10):
    global REGTEST_MINING
    global REGTEST_MINING_THREAD
    if REGTEST_MINING_THREAD:
        print("Mining already started")
        return

    print("Starting mining...")
    REGTEST_MINING = True

    def mine():
        time.sleep(interval)
        while REGTEST_MINING:
            #print("Mining a block...")
            rpc.mine_blocks()
            time.sleep(interval)

    REGTEST_MINING_THREAD = Thread(target=mine)
    REGTEST_MINING_THREAD.start()


def stop_mining():
    global REGTEST_MINING
    global REGTEST_MINING_THREAD
    print("Stopping mining...")
    REGTEST_MINING = False
    if REGTEST_MINING_THREAD:
        REGTEST_MINING_THREAD.join()
        REGTEST_MINING_THREAD = None
    print("Mining stopped.")

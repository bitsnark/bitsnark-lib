import pathlib
import json

GENERATED_JSON_DIR = pathlib.Path(__file__).parent.parent / 'tests' / 'demo' / 'generated'


def load_tx_json(filename):
    with open(GENERATED_JSON_DIR / filename) as f:
        return json.load(f)


if __name__ == '__main__':
    x = load_tx_json("00_INITIAL_PAT.txt")
    print(x)

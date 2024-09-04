import argparse

from .scripteval import eval_tapscript
from .steps import load_step_data, GENERATED_JSON_DIR


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('type', choices=['script', 'witness', 'eval', 'tapsim'])
    parser.add_argument('step')
    parser.add_argument('--scriptwiz', action='store_true', help="ide.scriptwiz.app compatible format")
    args = parser.parse_args()

    candidates = list(GENERATED_JSON_DIR.glob(f'{args.step}*'))
    if len(candidates) == 0:
        raise ValueError(f"No matching steps found for {args.step}")
    if len(candidates) > 1:
        raise ValueError(f"Multiple matching steps found for {args.step}: {candidates}")

    step = load_step_data(candidates[0].name)

    if args.scriptwiz:
        def format_int(x):
            return f'<{x}>'
        def format_bytes(x):
            return f'<0x{x.hex()}>'
    else:
        def format_int(x):
            return x
        def format_bytes(x):
            return "0x" + x.hex()

    if args.type == 'eval':
        eval_tapscript(
            witness_elems=step.witness_elems,
            script=step.script,
        )
        print("Eval ok")
        return

    if args.type == 'tapsim':
        pass

    if args.type == 'script':
        parts = step.script
    elif args.type == 'witness':
        parts = step.witness_elems
    else:
        raise ValueError(f"Unknown type {args.type}")

    for part in parts:
        if type(part) == int:
            print(format_int(part))
        elif type(part) == bytes:
            print(format_bytes(part))
        else:
            print(part)


if __name__ == '__main__':
    main()
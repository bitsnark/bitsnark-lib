from pprint import pprint


def pprint_json_structure(data):
    pprint(json_structure_repr(data))


def json_structure_repr(data):
    if isinstance(data, dict):
        return {k: json_structure_repr(v) for (k, v) in data.items()}
    elif isinstance(data, list):
        if len(set(type(v) for v in data)) == 1:
            t = type(data[0])
            if t not in (dict, list):
                return f"{type(data[0]).__name__}[]"

        return [json_structure_repr(v) for v in data]
    else:
        return f"{type(data).__name__}"

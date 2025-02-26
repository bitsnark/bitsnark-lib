from ._base import run_py_client_script


def helloworld(input_data):
    return {
        "hello": input_data.get("greeting", "world"),
    }


if __name__ == "__main__":
    run_py_client_script(helloworld)

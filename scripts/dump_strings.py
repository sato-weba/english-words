import pickle
import re
import struct
import zlib
from pathlib import Path

ARCHIVE = Path(r"C:\Users\hiu\Desktop\self-app\english-words\Z.A.T.O_file\game\scripts.rpa")


def load_index(path: Path):
    with path.open("rb") as handle:
        header = handle.read(40)
        offset = int(header[8:24], 16)
        key = int(header[25:33], 16)
        handle.seek(offset)
        index = pickle.loads(zlib.decompress(handle.read()))

        def start_to_bytes(value):
            if not value:
                return b""
            if not isinstance(value, bytes):
                value = value.encode("latin-1")
            return value

        for name in list(index):
            if len(index[name][0]) == 2:
                index[name] = [(item_offset ^ key, item_length ^ key) for item_offset, item_length in index[name]]
            else:
                index[name] = [
                    (item_offset ^ key, item_length ^ key, start_to_bytes(start))
                    for item_offset, item_length, start in index[name]
                ]
        return handle, index


def read_slot(data: bytes, slot: int) -> bytes | None:
    if not data.startswith(b"RENPY RPC2"):
        return zlib.decompress(data)
    pos = len(b"RENPY RPC2")
    while pos + 12 <= len(data):
        header_slot, start, length = struct.unpack("III", data[pos:pos + 12])
        if header_slot == 0:
            return None
        if header_slot == slot:
            return zlib.decompress(data[start:start + length])
        pos += 12
    return None


def main() -> None:
    with ARCHIVE.open("rb") as handle:
        header = handle.read(40)
        offset = int(header[8:24], 16)
        key = int(header[25:33], 16)
        handle.seek(offset)
        index = pickle.loads(zlib.decompress(handle.read()))

        def start_to_bytes(value):
            if not value:
                return b""
            if not isinstance(value, bytes):
                value = value.encode("latin-1")
            return value

        for name in list(index):
            if len(index[name][0]) == 2:
                index[name] = [(item_offset ^ key, item_length ^ key) for item_offset, item_length in index[name]]
            else:
                index[name] = [
                    (item_offset ^ key, item_length ^ key, start_to_bytes(start))
                    for item_offset, item_length, start in index[name]
                ]
        item_offset, item_length, prefix = index["ep1.rpyc"][0]
        handle.seek(item_offset)
        data = prefix + handle.read(item_length - len(prefix))

    blob = read_slot(data, 1) or b""
    needle = b"Everyone is looking"
    at = blob.find(needle)
    print("at", at)
    print(blob[at - 12:at + 40])


if __name__ == "__main__":
    main()

import pickle
import re
import struct
import zlib
from pathlib import Path

ARCHIVE = Path(r"C:\Users\hiu\Desktop\self-app\english-words\Z.A.T.O_file\game\scripts.rpa")


def start_to_bytes(value):
    if not value:
        return b""
    if not isinstance(value, bytes):
        value = value.encode("latin-1")
    return value


def read_slot(data: bytes) -> bytes:
    if not data.startswith(b"RENPY RPC2"):
        return zlib.decompress(data)
    pos = len(b"RENPY RPC2")
    while pos + 12 <= 200:
        header_slot, start, length = struct.unpack("III", data[pos:pos + 12])
        if header_slot == 0:
            break
        if header_slot == 1:
            return zlib.decompress(data[start:start + length])
        pos += 12
    return b""


def main() -> None:
    with ARCHIVE.open("rb") as handle:
        header = handle.read(40)
        offset = int(header[8:24], 16)
        key = int(header[25:33], 16)
        handle.seek(offset)
        index = pickle.loads(zlib.decompress(handle.read()))
        for name in list(index):
            if len(index[name][0]) == 2:
                index[name] = [(o ^ key, d ^ key) for o, d in index[name]]
            else:
                index[name] = [(o ^ key, d ^ key, start_to_bytes(s)) for o, d, s in index[name]]
        for name in ["script.rpyc", "ep1.rpyc", "ep3.rpyc", "jumpepisode.rpyc"]:
            item_offset, item_length, prefix = index[name][0]
            handle.seek(item_offset)
            blob = read_slot(prefix + handle.read(item_length - len(prefix)))
            hits = re.findall(rb"(?:ep[0-9][A-Za-z0-9_]*|start|prologue|chapter[0-9]*)", blob)
            uniq = []
            for hit in hits:
                text = hit.decode()
                if text not in uniq:
                    uniq.append(text)
            print(name, uniq[:40])


if __name__ == "__main__":
    main()

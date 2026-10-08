import pickle
import struct
import zlib
from pathlib import Path

ARCHIVE = Path(r"C:\Users\hiu\Desktop\self-app\english-words\Z.A.T.O_file\game\scripts.rpa")
OUT = Path(r"C:\Users\hiu\Desktop\self-app\english-words\sources\zato-script")
SKIP = {"gui.rpyc", "screens.rpyc", "options.rpyc", "jumpepisode.rpyc"}


def start_to_bytes(value):
    if not value:
        return b""
    if not isinstance(value, bytes):
        value = value.encode("latin-1")
    return value


def read_archive(path: Path):
    with path.open("rb") as handle:
        header = handle.read(40)
        offset = int(header[8:24], 16)
        key = int(header[25:33], 16)
        handle.seek(offset)
        index = pickle.loads(zlib.decompress(handle.read()))
        for name in list(index):
            if len(index[name][0]) == 2:
                index[name] = [(item_offset ^ key, item_length ^ key) for item_offset, item_length in index[name]]
            else:
                index[name] = [
                    (item_offset ^ key, item_length ^ key, start_to_bytes(start))
                    for item_offset, item_length, start in index[name]
                ]
        files = {}
        for name, entries in index.items():
            if not name.endswith(".rpyc") or name in SKIP:
                continue
            item_offset, item_length, prefix = entries[0]
            handle.seek(item_offset)
            files[name] = prefix + handle.read(item_length - len(prefix))
        return files


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


def strings_in(blob: bytes):
    found = []
    index = 0
    size = len(blob)
    while index < size - 5:
        if blob[index] != 0x58:
            index += 1
            continue
        length = struct.unpack_from("<I", blob, index + 1)[0]
        if not 8 <= length <= 400 or index + 5 + length > size:
            index += 1
            continue
        raw = blob[index + 5:index + 5 + length]
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            index += 1
            continue
        found.append(text)
        index += 5 + length
    return found


def clean(text: str) -> str:
    cleaned = text.replace("\\n", " ").replace("\\'", "'")
    while "{" in cleaned and "}" in cleaned:
        start = cleaned.find("{")
        end = cleaned.find("}", start)
        if end < 0:
            break
        cleaned = cleaned[:start] + cleaned[end + 1:]
    return " ".join(cleaned.split())


def keep(text: str) -> bool:
    if any(mark in text for mark in ("game/", "audio/", "images/", "gui/", ".png", ".mp3", ".ogg", ".webm")):
        return False
    if any(mark in text for mark in ("=", "#", "renpy.", "def ", "import ")):
        return False
    letters = sum(character.isalpha() for character in text)
    return letters >= 12 and text.count(" ") >= 2 and len(text) <= 220


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, data in sorted(read_archive(ARCHIVE).items()):
        lines = []
        seen = set()
        for raw in strings_in(read_slot(data)):
            text = clean(raw)
            if not keep(text) or text in seen:
                continue
            seen.add(text)
            lines.append(f'"{text}"')
        episode = Path(name).stem
        (OUT / f"{episode}.rpy").write_text("\n".join(lines) + "\n", encoding="utf-8")
        total += len(lines)
        print(f"{episode}: {len(lines)}")
    print("total", total)


if __name__ == "__main__":
    main()

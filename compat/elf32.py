"""Static ELF32/ARM inspection for a private runtime, without executing it."""
import struct


def inspect(data):
    if len(data) < 52 or data[:7] != b'\x7fELF\x01\x01\x01':
        raise ValueError('Expected little-endian ELF32')
    header = struct.unpack_from('<16sHHIIIIIHHHHHH', data)
    if header[2] != 40:
        raise ValueError('Expected ARM ELF')
    phoff, phsize, phcount = header[5], header[9], header[10]
    if phsize != 32 or phoff + phsize * phcount > len(data):
        raise ValueError('Invalid program headers')
    programs = [struct.unpack_from('<IIIIIIII', data, phoff + i * phsize) for i in range(phcount)]

    def segment(p):
        if p[1] + p[4] > len(data):
            raise ValueError('Truncated segment')
        return data[p[1]:p[1] + p[4]]

    def offset(address):
        for p in programs:
            if p[0] == 1 and p[2] <= address < p[2] + p[4]:
                return p[1] + address - p[2]
        raise ValueError('String table outside file-backed LOAD')

    dynamic = []
    interpreter = None
    for p in programs:
        if p[0] == 3:
            interpreter = segment(p).rstrip(b'\x00').decode('ascii')
        if p[0] == 2:
            block = segment(p)
            if len(block) % 8:
                raise ValueError('Invalid dynamic segment')
            for pos in range(0, len(block), 8):
                tag, value = struct.unpack_from('<II', block, pos)
                if tag == 0:
                    break
                dynamic.append((tag, value))
    tags = dict(dynamic)
    table = b''
    if 5 in tags and 10 in tags:
        start = offset(tags[5])
        table = data[start:start + tags[10]]
        if len(table) != tags[10]:
            raise ValueError('Truncated string table')

    def string(pos):
        end = table.find(b'\x00', pos)
        if pos >= len(table) or end < 0:
            raise ValueError('Invalid dynamic string')
        return table[pos:end].decode('ascii')

    flags = header[7]
    hard, soft = bool(flags & 0x400), bool(flags & 0x200)
    if hard and soft:
        raise ValueError('Conflicting ARM float ABI flags')
    required_versions = {}
    if 0x6ffffffe in tags:
        pos = offset(tags[0x6ffffffe])
        for _ in range(tags.get(0x6fffffff, 0)):
            _, count, filename, aux, nxt = struct.unpack_from('<HHIII', data, pos)
            item = pos + aux
            versions = []
            for _ in range(count):
                _, _, _, name, following = struct.unpack_from('<IHHII', data, item)
                versions.append(string(name))
                if not following:
                    break
                item += following
            required_versions[string(filename)] = versions
            if not nxt:
                break
            pos += nxt
    provided_versions = []
    if 0x6ffffffc in tags:
        pos = offset(tags[0x6ffffffc])
        for _ in range(tags.get(0x6ffffffd, 0)):
            _, _, _, _, _, aux, nxt = struct.unpack_from('<HHHHIII', data, pos)
            name, _ = struct.unpack_from('<II', data, pos + aux)
            provided_versions.append(string(name))
            if not nxt:
                break
            pos += nxt
    return {
        'machine': 'ARM', 'bits': 32, 'endian': 'little', 'flags': flags,
        'float_abi': 'hard' if hard else 'soft' if soft else 'unspecified',
        'interpreter': interpreter,
        'needed': [string(v) for t, v in dynamic if t == 1],
        'soname': string(tags[14]) if 14 in tags else None,
        'rpath': string(tags[15]) if 15 in tags else None,
        'runpath': string(tags[29]) if 29 in tags else None,
        'required_versions': required_versions, 'provided_versions': provided_versions,
    }


def dependency_closure(executable, libraries):
    """Require each linked SONAME to resolve inside the bundle, with matching ABI."""
    if executable['float_abi'] not in ('hard', 'soft'):
        raise ValueError('Executable float ABI not established')
    pending = list(executable['needed'])
    visited = set()
    while pending:
        name = pending.pop()
        if name in visited:
            continue
        if name not in libraries:
            raise ValueError('Missing private library: ' + name)
        lib = libraries[name]
        if lib['float_abi'] != executable['float_abi']:
            raise ValueError('Incompatible float ABI: ' + name)
        if lib.get('rpath') or lib.get('runpath'):
            raise ValueError('Unexpected library search path: ' + name)
        visited.add(name)
        pending.extend(lib['needed'])
    for obj in [executable] + [libraries[name] for name in visited]:
        for name, required in obj.get('required_versions', {}).items():
            if name not in libraries:
                raise ValueError('Missing version provider: ' + name)
            missing = set(required) - set(libraries[name].get('provided_versions', []))
            if missing:
                raise ValueError('Missing symbol versions in ' + name + ': ' + ', '.join(sorted(missing)))
    return sorted(visited)

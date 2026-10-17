"""Conservative native SSEQ control-flow proof; never execute opaque bytes.

Calls include both callee and continuation (an overapproximation of returns).
BeginTrack includes the new track and its parent continuation. Unconditional
jumps do not fall through. Random, conditional and variable-read instructions are not admitted.
The four native battle cues also write fixed progression counters (B0); the
pinned renderer implements that deterministic assignment, and no reader or
conditional depends on it in this corpus. This permits compiler dead byte tails only when proven unreachable.
"""
import hashlib
import json
from collections import Counter

COMMANDS = {0x80, 0x81, 0x93, 0x94, 0x95, 0xC0, 0xC1, 0xC4, 0xC5, 0xC6, 0xC7,
            0xB0, 0xC9, 0xCA, 0xCB, 0xCC, 0xCD, 0xD5, 0xE0, 0xE1, 0xFD, 0xFE, 0xFF}


def prove_payload(payload, entry_offset=0):
    """Decode reachable literal offsets, independent of ndspy's whole-list aliases.

    ndspy's graph parser can produce a destination object not retained in its
    final linear events list for shared music subsequences. We therefore use
    its pinned instruction decoders at literal FAT offsets, not object aliases.
    Non-control operands must reconstruct literal bytes, preserving redundant
    zero varint groups used by the source. Control operands are original u24.
    Shared byte ranges may be interpreted at several native target offsets;
    each interpretation is independently verified and overlaps are recorded.
    """
    from ndspy.soundSequence import NoteSequenceEvent, _EVENT_TYPES
    pending, reached, byte_owner, edges, counts = [entry_offset], {}, {}, [], Counter()
    nodes, track_entries = {}, {0: entry_offset}
    overlapping, padded_varints = set(), []
    while pending:
        position = pending.pop()
        if position in reached:
            continue
        if position < 0 or position >= len(payload):
            raise RuntimeError('Native control flow outside literal payload: ' + str(position))
        opcode = payload[position]
        if opcode >= 0x80 and opcode not in COMMANDS:
            raise RuntimeError('Unverified reachable native opcode ' + hex(opcode) + ' at ' + str(position))
        targets = []
        if opcode in (0x93, 0x94, 0x95):
            length = 5 if opcode == 0x93 else 4
            if position + length > len(payload):
                raise RuntimeError('Truncated native control instruction')
            target = int.from_bytes(payload[position + length - 3:position + length], 'little')
            targets.append(target)
            if opcode == 0x93:
                number = payload[position + 1]
                if number in track_entries and track_entries[number] != target:
                    raise RuntimeError('Native track reopened with a different entry')
                track_entries[number] = target
            name = {0x93: 'BeginTrackSequenceEvent', 0x94: 'JumpSequenceEvent', 0x95: 'CallSequenceEvent'}[opcode]
        else:
            cls = NoteSequenceEvent if opcode < 0x80 else _EVENT_TYPES[opcode]
            event = cls.fromData(opcode, payload, position)
            literal = bytes(event.save())
            length, name = event.dataLength, type(event).__name__
            if opcode < 0x80 or opcode in (0x80, 0x81):
                prefix = 2 if opcode < 0x80 else 1
                end = position + prefix
                while end < len(payload) and payload[end] & 0x80:
                    end += 1
                if end >= len(payload) or end - position - prefix > 4:
                    raise RuntimeError('Truncated or unbounded native variable-length operand')
                length = end + 1 - position
                padding = length - len(literal)
                if padding < 0 or payload[position:position + length] != literal[:prefix] + b'\x80' * padding + literal[prefix:]:
                    raise RuntimeError('Native variable operand does not match decoded value at ' + str(position))
                if padding:
                    padded_varints.append({'offset': position, 'extraZeroGroups': padding})
            elif payload[position:position + length] != literal or len(literal) != length:
                raise RuntimeError('Reachable instruction failed literal byte roundtrip at ' + str(position))
        for byte in range(position, position + length):
            if byte in byte_owner and byte_owner[byte] != position:
                overlapping.add(byte)
            byte_owner[byte] = position
        reached[position] = length
        counts[name] += 1
        if opcode not in (0x94, 0xFF):
            targets.append(position + length)
        nodes[position] = {'opcode': opcode, 'name': name, 'targets': list(targets)}
        edges.extend([position, target] for target in targets)
        pending.extend(targets)
    tracks = []
    for number, entry in sorted(track_entries.items()):
        visited, waiting, track_counts = set(), [entry], Counter()
        while waiting:
            address = waiting.pop()
            if address in visited:
                continue
            visited.add(address)
            node = nodes[address]
            track_counts[node['name']] += 1
            # Parent continues after BeginTrack; child is proven separately.
            waiting.extend(node['targets'][1:] if node['opcode'] == 0x93 else node['targets'])
        tracks.append({'track': number, 'entryOffset': entry, 'reachableInstructions': len(visited),
                       'eventCounts': dict(track_counts)})
    ranges, start = [], None
    for offset in range(len(payload) + 1):
        unused = offset < len(payload) and offset not in byte_owner
        if unused and start is None:
            start = offset
        if not unused and start is not None:
            ranges.append({'offset': start, 'bytes': offset-start, 'sha256': hashlib.sha256(payload[start:offset]).hexdigest(), 'reachable': False})
            start = None
    return {'method': 'literal-offset-conservative-static-control-flow-v3', 'entryOffset': entry_offset,
            'literalOffsetsAndOperandsVerified': True, 'nonminimalZeroVarints': padded_varints, 'payloadSHA256': hashlib.sha256(payload).hexdigest(),
            'reachableInstructions': len(reached),
            'instructionOffsetsSHA256': hashlib.sha256(json.dumps(sorted(reached), separators=(',', ':')).encode()).hexdigest(),
            'controlFlowEdges': len(edges),
            'controlFlowEdgesSHA256': hashlib.sha256(json.dumps(edges, separators=(',', ':')).encode()).hexdigest(),
            'overlappingInstructionByteCount': len(overlapping),
            'trackFlows': tracks, 'unreachableByteRanges': ranges, 'reachableEventCounts': dict(counts)}

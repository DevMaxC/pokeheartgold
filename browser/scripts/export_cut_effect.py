"""Export the original Cut model, all three simultaneous animations and audio.

Requires ndspy4.2.0/numpy2.2.6, apicula and the pinned DualRip checkout used by
export_hatch_music.py. The bounded animation ABI is checked against these
actual resources; unsupported tracks reject rather than silently disappear.
"""
from pathlib import Path
import argparse, base64, hashlib, importlib.metadata, json, struct, subprocess, sys, tempfile, wave

ROOT = Path(__file__).resolve().parents[2]
RENDERER = '80f878b0ebf100f391028bcef69f7c5743473770'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def member(raw, index):
    assert raw[:4] == b'NARC'
    cursor = struct.unpack_from('<H', raw, 12)[0]
    offsets = payload = None
    while cursor < len(raw):
        kind, size = struct.unpack_from('<4sI', raw, cursor)
        assert size >= 8 and cursor + size <= len(raw)
        if kind == b'BTAF':
            assert index < struct.unpack_from('<H', raw, cursor + 8)[0]
            offsets = struct.unpack_from('<II', raw, cursor + 12 + index * 8)
        elif kind == b'GMIF':
            payload = raw[cursor + 8:cursor + size]
        cursor += size
    assert offsets is not None and payload is not None
    return payload[offsets[0]:offsets[1]]


def dictionary(raw, offset, width):
    count = raw[offset + 1]
    header = offset + struct.unpack_from('<H', raw, offset + 6)[0]
    unit, names = struct.unpack_from('<HH', raw, header)
    assert unit == width
    return [(raw[header + 4 + i * width:header + 4 + (i + 1) * width],
             raw[header + names + 16 * i:header + names + 16 * (i + 1)].rstrip(b'\0').decode('ascii')) for i in range(count)]


def resource_base(raw, section):
    offset = struct.unpack_from('<I', raw, 16)[0]
    assert raw[offset:offset + 4] == section
    entries = dictionary(raw, offset + 8, 4)
    assert len(entries) == 1
    value, name = entries[0]
    return offset + struct.unpack('<I', value)[0], name


def joint_frames(raw):
    base, name = resource_base(raw, b'JNT0')
    magic, frames, count, flags, _, _ = struct.unpack_from('<4sHHIII', raw, base)
    assert (magic, frames, count, flags) == (b'J\0AC', 45, 12, 1)
    offsets = struct.unpack_from('<' + 'H' * count, raw, base + 20)
    result = []
    for frame in range(frames):
        poses = []
        for node, offset in enumerate(offsets):
            cursor = base + offset
            tag = struct.unpack_from('<I', raw, cursor)[0]
            assert tag >> 24 == node
            cursor += 4
            translation, scale, inverse = [0] * 3, [4096] * 3, [4096] * 3
            if not tag & 1:
                assert not tag & (4 | 128 | 1024), 'Cut has no model-relative tracks'
                assert tag & 64, 'Cut has identity joint rotations; other encodings need explicit support'
                if not tag & 2:
                    for axis, bit in enumerate([8, 16, 32]):
                        if tag & bit:
                            translation[axis] = struct.unpack_from('<i', raw, cursor)[0]
                            cursor += 4
                        else:
                            info, data = struct.unpack_from('<II', raw, cursor)
                            cursor += 8
                            assert info & ~0x20000000 == frames << 16, 'Only full-rate Cut translation tracks'
                            translation[axis] = struct.unpack_from('<h' if info & 0x20000000 else '<i', raw, base + data + frame * (2 if info & 0x20000000 else 4))[0]
                if not tag & 512:
                    for axis, bit in enumerate([2048, 4096, 8192]):
                        if tag & bit:
                            scale[axis], inverse[axis] = struct.unpack_from('<ii', raw, cursor)
                            cursor += 8
                        else:
                            info, data = struct.unpack_from('<II', raw, cursor)
                            cursor += 8
                            assert info & ~0x20000000 == frames << 16, 'Only full-rate Cut scale tracks'
                            scale[axis], inverse[axis] = struct.unpack_from('<hh' if info & 0x20000000 else '<ii', raw, base + data + frame * (4 if info & 0x20000000 else 8))
            poses.append({'translationFx32': translation, 'scaleFx32': scale, 'inverseScaleFx32': inverse})
        result.append(poses)
    return {'archive': 0, 'name': name, 'frameCount': frames, 'nativeFrames': result}


def material_frames(raw, model_materials):
    base, name = resource_base(raw, b'MAT0')
    assert struct.unpack_from('<4sH', raw, base) == (b'M\0AM', 45)
    tracks = {}
    for data, material in dictionary(raw, base + 8, 20):
        infos = struct.unpack('<5I', data)
        assert all(info & 0x20000000 for info in infos[:4]), 'Cut material colors are constant'
        colors = [info & 32767 for info in infos[:4]]
        assert colors == model_materials[material]['colors'], 'Native vertex colors must remain unchanged'
        alpha = infos[4]
        assert alpha & ~65535 == 45 << 16, 'Cut alpha is full-rate u8'
        values = list(raw[base + (alpha & 65535):base + (alpha & 65535) + 45])
        assert len(values) == 45 and all(0 <= value <= 31 for value in values)
        tracks[material] = {'colors': colors, 'alpha': values}
    assert set(tracks) == set(model_materials)
    return {'archive': 1, 'name': name, 'frameCount': 45, 'tracks': tracks}


def texture_frames(raw, model_materials):
    base, name = resource_base(raw, b'SRT0')
    assert struct.unpack_from('<4sH', raw, base) == (b'M\0AT', 45)
    tracks = {}
    for data, material in dictionary(raw, base + 8, 40):
        ss, ssv, st, stv, rotation, offset, ts, tsv, tt, ttv = struct.unpack('<10I', data)
        assert (ss, ssv, st, stv, ts, tsv, tt, ttv) == (0x3000002d, 4096, 0x3000002d, 4096, 0x3000002d, 0, 0x3000002d, 0)
        assert rotation == 45, 'Cut texture rotation is full-rate packed sin/cos'
        width, height = model_materials[material]['dimensions']
        assert (width, height) == (8, 8), 'Literal Maya rotation-only matrix ratio is one'
        values = []
        for frame in range(45):
            sine, cosine = struct.unpack_from('<hh', raw, base + offset + frame * 4)
            # Literal texmtxCalc_flagTS_ (Maya). DS translation is in 1/16 texel
            # units after FX32 multiplication, not normalized UV coordinates.
            values.append([cosine, -sine, sine, cosine,
                           width * (4096 - sine - cosine) << 3,
                           height * (sine - cosine + 4096) << 3])
        tracks[material] = {'dimensions': [width, height], 'matricesFx32': values}
    assert set(tracks) == {'ha1', 'ha2', 'ha3'}
    return {'archive': 2, 'name': name, 'frameCount': 45, 'tracks': tracks}


def model_info(raw):
    base, name = resource_base(raw, b'MDL0')
    assert raw[base + 21:base + 25] == bytes([0, 0, 12, 5]), 'Cut uses basic joints and Maya textures'
    names = [name for _, name in dictionary(raw, base + 64, 4)]
    material_base = base + struct.unpack_from('<I', raw, base + 8)[0]
    materials = {}
    for value, material in dictionary(raw, material_base + 4, 4):
        offset = material_base + struct.unpack('<I', value)[0]
        diffuse, emission = struct.unpack_from('<II', raw, offset + 4)
        misc, width, height = struct.unpack_from('<HHH', raw, offset + 30)
        assert not misc & 1 or misc & 15 == 15, 'Rest texture matrix must be identity'
        materials[material] = {'colors': [diffuse & 32767, diffuse >> 16 & 32767, emission & 32767, emission >> 16 & 32767], 'dimensions': [width, height]}
    return name, names, materials


def pack_glb(path, names):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    assert [node['name'] for node in doc['nodes'][:len(names)]] == names
    for index in range(len(names)):
        doc['nodes'][index].setdefault('extras', {})['nativeCutJoint'] = index
    for image in doc.get('images', []):
        if 'uri' in image:
            image['uri'] = 'data:image/png;base64,' + base64.b64encode((path.parent / image['uri']).read_bytes()).decode()
    data = json.dumps(doc, separators=(',', ':')).encode()
    data += b' ' * (-len(data) % 4)
    tail = raw[20 + size:]
    return struct.pack('<III', 0x46546c67, 2, 20 + len(data) + len(tail)) + struct.pack('<II', len(data), 0x4e4f534a) + data + tail


def export_audio(output, renderer):
    assert importlib.metadata.version('ndspy') == '4.2.0' and importlib.metadata.version('numpy') == '2.2.6'
    assert subprocess.check_output(['git', '-C', str(renderer), 'rev-parse', 'HEAD'], text=True).strip() == RENDERER
    assert not subprocess.check_output(['git', '-C', str(renderer), 'status', '--porcelain', '--untracked-files=no'], text=True).strip()
    sys.path.insert(0, str(renderer))
    import numpy as np
    from ndspy.soundArchive import SDAT
    from dualrip.formats.sdat.sdat import SdatFile
    from dualrip.engine.sdat.render import LiveRenderer
    from dualrip.export import write_wav
    raw = (ROOT / 'files/data/sound/gs_sound_data.sdat').read_bytes()
    u16 = lambda offset: struct.unpack_from('<H', raw, offset)[0]
    u32 = lambda offset: struct.unpack_from('<I', raw, offset)[0]
    symb, info, fat = u32(0x10), u32(0x18), u32(0x20)
    def record(section, table, index):
        table_offset = section + u32(section + 8 + table * 4)
        assert index < u32(table_offset)
        return section + u32(table_offset + 4 + index * 4)
    def symbol(table, index):
        offset = record(symb, table, index)
        return raw[offset:raw.index(b'\0', offset)].decode('ascii')
    def resource(file_id):
        offset, size = u32(fat + 12 + file_id * 16), u32(fat + 16 + file_id * 16)
        return {'fileId': file_id, 'offset': offset, 'size': size, 'sha256': sha(raw[offset:offset + size])}
    archive, original = SdatFile(str(ROOT / 'files/data/sound/gs_sound_data.sdat')), SDAT(raw)
    cue, seq = original.sequences[1610]
    assert (cue, seq.bankID, seq.playerID) == ('SEQ_SE_DP_FW015', 750, 3)
    seq.parse()
    allowed = {'DefineTracksSequenceEvent', 'BeginTrackSequenceEvent', 'MonoPolySequenceEvent', 'TempoSequenceEvent', 'InstrumentSwitchSequenceEvent', 'TrackVolumeSequenceEvent', 'PanSequenceEvent', 'PortamentoRangeSequenceEvent', 'PortamentoSequenceEvent', 'NoteSequenceEvent', 'RestSequenceEvent', 'EndTrackSequenceEvent'}
    for event in seq.events:
        assert type(event).__name__ in allowed or type(event).__name__ == 'RawDataSequenceEvent' and not bytes(event.data).strip(b'\xff\x00')
    arc = archive.sequence(1610)
    entry = arc.entries[0]
    seq_record = record(info, 0, 1610)
    sequence = resource(u16(seq_record))
    event_offset = sequence['offset'] + u32(sequence['offset'] + 24)
    assert arc.blob == raw[event_offset:sequence['offset'] + sequence['size']]
    assert symbol(0, 1610) == cue and entry.bank_id == 750 and entry.volume == raw[seq_record + 6]
    bank, waves = archive.bank(750)
    render = LiveRenderer(arc.blob, entry.offset, bank, waves, entry.volume, 32768, player_prio=entry.cpr, loop_passes=1)
    chunks = []
    while not render.finished:
        value = render.step()
        if value is not None:
            chunks.append(value)
        assert render.emitted < 32768 * 10
    pcm = np.concatenate(chunks)
    assert render.loop_marks is None and np.max(np.abs(pcm.astype(np.int32))) > 0
    target = output / '1610-SEQ_SE_DP_FW015.wav'
    write_wav(str(target), pcm, 32768, None)
    bank_record = record(info, 2, 750)
    wave_ids = [u16(bank_record + 4 + slot * 2) for slot in range(4)]
    dependencies = [{'id': wid, 'name': symbol(3, wid), **resource(u16(record(info, 3, wid)))} for wid in wave_ids if wid != 65535]
    sound = {'id': 1610, 'key': cue, 'file': target.name, 'sampleRate': 32768, 'frames': len(pcm), 'channels': 2, 'wavSHA256': sha(target.read_bytes()), 'bank': 750, 'volume': entry.volume, 'player': 3, 'sequence': sequence, 'bankResource': resource(u16(bank_record)), 'waveArchives': dependencies, 'eventPayloadOffset': event_offset, 'eventPayloadSHA256': sha(arc.blob)}
    _, pv = original.sequences[2]
    pv.parse()
    assert [type(event).__name__ for event in pv.events] == ['TempoSequenceEvent', 'InstrumentSwitchSequenceEvent', 'TrackVolumeSequenceEvent', 'PanSequenceEvent', 'NoteSequenceEvent', 'EndTrackSequenceEvent', 'RawDataSequenceEvent']
    assert (pv.events[0].value, pv.events[1].bankID, pv.events[1].instrumentID, pv.events[2].value, pv.events[3].value) == (100, 0, 0, 127, 64)
    note = pv.events[4]
    assert (note.pitch, note.velocity, note.duration) == (60, 127, 0)
    cries = {}
    folder = output / 'cries'
    folder.mkdir(exist_ok=True)
    for species in range(1, 495):
        bank_name, bank = original.banks[species]
        definition = bank.instruments[0].noteDefinition
        assert int(definition.type) == 1, 'Original default cries must use PCM instruments'
        assert (definition.waveID, definition.waveArchiveIDID, definition.pitch, definition.attack, definition.decay, definition.sustain, definition.release, definition.pan) == (0, 0, 60, 127, 127, 127, 127, 64)
        assert bank.waveArchiveIDs == [species]
        wave_name, wave_bank = original.waveArchives[species]
        assert len(wave_bank.waves) == 1
        sample = wave_bank.waves[0]
        assert int(sample.waveType) == 0 and not sample.isLooped
        native_wave = resource(u16(record(info, 3, species)))
        swar = native_wave['offset']
        assert raw[swar:swar + 4] == b'SWAR' and u32(swar + 0x38) == 1
        sample_offset = swar + u32(swar + 0x3c)
        pcm_offset = sample_offset + 12
        assert raw[sample_offset] == 0 and raw[sample_offset + 1] == 0 and u16(sample_offset + 2) == sample.sampleRate
        assert sample.data == raw[pcm_offset:pcm_offset + len(sample.data)]
        target = folder / ('cry-' + str(species) + '.wav')
        with wave.open(str(target), 'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(1); wav.setframerate(sample.sampleRate)
            wav.writeframes(bytes((value + 128) & 255 for value in sample.data))
        cries[str(species)] = {'file': 'cries/' + target.name, 'sampleRate': sample.sampleRate, 'frames': len(sample.data), 'channels': 1, 'wavSHA256': sha(target.read_bytes()), 'signedPCMSourceSHA256': sha(sample.data), 'bank': species, 'bankName': bank_name, 'waveArchive': species, 'waveArchiveName': wave_name, 'waveResource': native_wave, 'nativePCMOffset': pcm_offset, 'nativeTimer': u16(sample_offset + 4), 'bankResource': resource(u16(record(info, 2, species)))}
    engine_files = sorted((renderer / 'dualrip/engine/sdat').glob('*.py')) + sorted((renderer / 'dualrip/formats/sdat').glob('*.py'))
    return {'sound': sound, 'cries': cries, 'cryPattern': 0, 'crySequence': {'id': 2, 'key': original.sequences[2][0], 'sequence': resource(u16(record(info, 0, 2))), 'volume': pv.volume, 'nativeInitialVolume': 100, 'notePitch': 60, 'bankRootPitch': 60, 'adsr': [127] * 4}, 'sourceSDATSHA256': sha(raw), 'renderer': {'commit': RENDERER, 'files': {str(path.relative_to(renderer)): sha(path.read_bytes()) for path in engine_files}, 'limitation': 'Native sequence/sample emulator render; not a DS hardware/DAC/shared-channel capture. Cries retain literal original PCM8 and native sample rates, not hardware timer/mixer interpolation. Browser cry gain100/127 is a linear presentation mapping, not the DS logarithmic mixer/ADSR hardware path.'}}


def export(apicula, renderer, output):
    output.mkdir(parents=True, exist_ok=True)
    archive = (ROOT / 'files/a/1/3/4').read_bytes()
    native = [member(archive, index) for index in range(4)]
    name, names, materials = model_info(native[3])
    with tempfile.TemporaryDirectory() as temporary:
        folder = Path(temporary)
        paths = []
        for index in [3, 0]:
            path = folder / ('cut-' + str(index) + '.bin');path.write_bytes(native[index]);paths.append(str(path))
        subprocess.run([str(apicula), 'convert', '-f=glb', *paths, '-o', str(folder / 'converted')], check=True, capture_output=True)
        glbs = list((folder / 'converted').glob('*.glb'))
        assert len(glbs) == 1
        glb = pack_glb(glbs[0], names)
    (output / 'model.glb').write_bytes(glb)
    manifest = {'version': 1, 'name': name, 'asset': 'model.glb', 'glbSHA256': sha(glb), 'modelArchive': 3, 'nativeNodeNames': names, 'materials': materials, 'ticksPerSecond': 30, 'modelFinishedAfterUpdates': 45, 'completionAfterQueueUpdates': 47, 'scheduler': {'wrapperPriority': 0, 'modelPriority': 1024, 'newTaskMayRunInDispatchTick': True}, 'joint': joint_frames(native[0]), 'color': material_frames(native[1], materials), 'texture': texture_frames(native[2], materials), 'nativeMemberSHA256': {str(index): sha(value) for index, value in enumerate(native)}, 'sources': {}}
    for path in ['files/a/1/3/4', 'src/field/field_move_effects.c', 'asm/field_move_effects_data.s', 'src/sys_task.c', 'src/main.c', 'src/field/field_3d_object_task.c', 'src/field/area_data.c', 'src/sound_playback.c', 'src/scrcmd_sound.c', 'lib/NitroSystem/src/g3d_anm_bca_trans.c', 'lib/NitroSystem/src/g3d_anm_bca_scale.c', 'lib/NitroSystem/src/g3d_anm_bma.c', 'lib/NitroSystem/src/g3d_anm_bta_sincos.c', 'lib/NitroSystem/src/g3d_cgtool_maya_tex.c', 'lib/include/nnsys/g3d_anm_mat_internal.h', 'browser/scripts/export_cut_effect.py']:
        manifest['sources'][path] = sha((ROOT / path).read_bytes())
    manifest['converter'] = {'binarySHA256': sha(apicula.read_bytes()), 'playback': 'Original SDK integer-frame tables, not converter60fps clips/quaternion interpolation'}
    manifest['audio'] = export_audio(output, renderer)
    (output / 'resources.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apicula', type=Path, required=True)
    parser.add_argument('--renderer', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'browser/public/source/cut')
    args = parser.parse_args()
    manifest = export(args.apicula.resolve(), args.renderer.resolve(), args.output)
    print(json.dumps({'frames': manifest['joint']['frameCount'], 'cries': len(manifest['audio']['cries']), 'model': manifest['glbSHA256']}))

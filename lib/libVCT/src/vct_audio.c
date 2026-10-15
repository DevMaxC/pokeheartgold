#include "vct/vct_audio_internal.h"

// libVCT audio streams: streaming start / stop per session, sending (the game's samples go into a
// double send buffer; vct_prepare_send_buffer filters, detects voice activity and encodes them) and
// receiving (packets go through the decoder list into one audio queue per stream, VCT_ReceiveAudio
// mixes the streams that have data).

// The TU's .bss is pooled (MWCC -ipa file, sorted by size) at 0x021D6040..0x021D6F58; other libVCT
// files reach parts of it through _021D6040 + offset.
u16 _021D6040; // sequence number of the next audio packet
static u32 sAudioVad;
static u32 sAudioReset;
static u32 sAudioEcho;
static u32 sAudioPacketSize;
static u32 sAudioMask;
AdpcmState sAdpcmState;
static u32 sAudioFlag;
static s32 sAudioCodec;
static u32 sAudioSessions;
static u32 sAudioSize;
Session *sAudioSession[AUDIO_STREAM_COUNT];
Stream sStream[AUDIO_STREAM_COUNT];
u32 _021D6234[0x44C / 4]; // samples of the second and third stream before mixing
SendInfo sSendInfo;

static inline void InitializeAudioStreams(void) {
    u32 i;
    for (i = 0; i < 3; i++) {
        sAudioSession[i] = 0;
        vct_init_audio_queue(i);
        vct_init_stream(&sStream[i], i, (u32)-1);
    }
}

#pragma push
#pragma optimization_level 2

s32 vct_init_audio(void) {
    _021D6040 = OS_GetTickLo();
    sEnableVAD = 1;
    sAudioSessions = 0;
    sAudioMask = 0;
    if (__vct.mode == 1) {
        sAudioCodec = 0;
    } else {
        sAudioCodec = 4;
    }
    sAudioSize = 0x440;
    // read through a const view (needed for the match)
    sAudioPacketSize = ((const Codec *)sCodecInfo)[sAudioCodec].blocks * 0x44 + ((const Codec *)sCodecInfo)[sAudioCodec].header + AUDIO_HEADER_SIZE;
    sSendInfo.read = 0;
    sSendInfo.write = 0;
    sSendInfo.mask = 0;
    sSendInfo.packet = NULL;
    sSendInfo.balanceIndex = 0;
    sSendInfo.balance = 0;
    vct_init_vad();
    InitializeAudioStreams();
    vct_init_decoder();
    InitFIRFilter();
    return 1;
}

#pragma pop

void vct_finish_audio(void) {
    sAudioSessions = 0;
}

#pragma push
#pragma optimization_level 2

int VCT_StartStreaming(Session *s) {
    u32 i;
    u32 n;
    if (!s) {
        return 0;
    }
    if (sAudioSessions == 3) {
        return 0;
    }
    if (s->mode != 2 && s->mode != 3) {
        return 0;
    }
    n = sizeof(sAudioSession) / sizeof(sAudioSession[0]);
    for (i = 0; i < n; i++) {
        if (sAudioSession[i] == s) {
            return 1;
        }
    }
    for (i = 0; i < n; i++) {
        if (sAudioSession[i] == 0) {
            sAudioSession[i] = s;
            break;
        }
    }
    sAudioSessions++;
    sAudioMask |= s->mask;
    vct_init_stream(&sStream[i], i, s->other);
    vct_init_audio_queue(i);
    if (s->mode != 2) {
        return 1;
    }
    if (sAudioSessions == 1) {
        VCT_ResetVAD();
        _021D6040 = OS_GetTickLo();
        sAdpcmState.sample = 0;
        sAdpcmState.index = 0;
        sAudioReset = 1;
        sSendInfo.read = 0;
        sSendInfo.write = 0;
        sSendInfo.mask = 0;
        sSendInfo.packet = NULL;
        sSendInfo.balanceIndex = 0;
        sSendInfo.balance = 0;
    }
    return 1;
}

#pragma pop

void VCT_StopStreaming(Session *session) {
    u32 i;
    for (i = 0; i < 3; i++) {
        if (sAudioSession[i] == session) {
            sAudioSession[i] = 0;
            sAudioSessions--;
            vct_reset_stream(&sStream[i]);
            vct_flush_audio_queue(i);
            vct_flush_decoder(i);
            sAudioMask &= ~session->mask;
            break;
        }
    }
    if (sAudioSessions != 0) {
        return;
    }
    sAudioReset = 1;
    VCT_ResetVAD();
    sAudioMask = 0;
}

#pragma push
#pragma opt_rotateloops off

int VCT_SendAudio(void *data, u32 size) {
    AudioHeader *send;
    register u32 i;
    int found;
    found = 0;
    if (size != sAudioSize) {
        return 0;
    }
    if (!sAudioSessions) {
        return 0;
    }
    for (i = 0; i < 3; i++) {
        if (sAudioSession[i] && sAudioSession[i]->mode == 2) {
            found = 1;
            break;
        }
    }
    if (!found) {
        return 0;
    }
    send = (AudioHeader *)(sSendInfo.buffer + ((sSendInfo.write & 1) ? 0 : 0x460));
    send->magic = LIBVCT_PACKET_MAGIC;
    if (sAudioCodec >= 2) {
        MIi_CpuCopyFast(data, (u32 *)((u8 *)send + AUDIO_HEADER_SIZE + sizeof(AdpcmState)), size);
    } else {
        MIi_CpuCopyFast(data, (u32 *)((u8 *)send + AUDIO_HEADER_SIZE), size);
    }
    {
        u16 sequence = _021D6040;
        send->kind = 0x40;
        _021D6040 = sequence + 1;
        send->sequence = sequence;
    }
    send->timestamp = _ll_udiv(OS_GetTick(), 64);
    sSendInfo.write++;
    return 1;
}

#pragma pop

int VCTi_ReceiveAudioData(void *dst, u32 size, u32 ch, u32 *mask) {
    int count;
    AudioPacket *p;
    Stream *stream;
    int first;
    u64 now;
    stream = &sStream[ch];
    first = 1;
    count = vct_count_audio_queue(ch);
    while (count) {
        now = OS_GetTick();
        p = vct_top_audio_queue(ch);
        if (p == NULL) {
            goto empty;
        }
        if (p->ready > now + 52) {
            if (p->flagged == 0 && stream->previous != NULL) {
                stream->retrans++;
                MIi_CpuCopyFast(((AudioPacket *)stream->previous)->data, dst, size);
                vct_free_packet_buffer(stream->previous);
                stream->previous = NULL;
                if (mask != NULL) {
                    *mask |= 1 << p->owner;
                }
                return 1;
            }
            return 0;
        }
        if (now > p->ready + 0x8B4C) {
            stream->lastPlayed = p->sequence;
            count = vct_save_previous_buffer(stream, p);
            vct_top_audio_queue(ch);
            first = 0;
            continue;
        }
        {
            u32 seq = p->sequence;
            u32 last = stream->lastPlayed;
            if (last + 1 != seq && last != 0 && last <= seq && p->flagged == 0) {
                stream->lost++;
            }
        }
        stream->lastPlayed = p->sequence;
        if (first && stream->skip) {
            count = vct_save_previous_buffer(stream, p);
            vct_top_audio_queue(ch);
            stream->skip--;
            continue;
        }
        {
            u32 delta = now - p->receive;
            u32 diff = delta - stream->oldDelay;
            u32 d;
            stream->oldDelay = delta;
            d = delta + ((diff - delta) >> 4);
            stream->delay = d;
            stream->jitter = d;
        }
        MIi_CpuCopyFast(p->data, dst, size);
        vct_save_previous_buffer(stream, p);
        if (mask != NULL) {
            *mask |= 1 << p->owner;
        }
        return 1;
empty:
        stream->left = count;
        return 0;
    }
    if (stream->previous != NULL) {
        vct_free_packet_buffer(stream->previous);
        stream->previous = NULL;
    }
    return 0;
}

int VCT_ReceiveAudio(void *data, u32 size, u32 *mask) {
    u32 i, j;
    int result;
    if (mask) {
        *(volatile u32 *)mask = 0;
    }
    result = 0;
    if (size == sAudioSize && sAudioSessions) {
        for (i = 0; i < 3; i++) {
            if (VCTi_ReceiveAudioData(data, size, i, mask) == 1) {
                result = 1;
                break;
            }
        }
        if (result) {
            j = i + 1;
            if (j == 3) {
                result = 1;
            } else {
                for (; j < 3; j++) {
                    if (VCTi_ReceiveAudioData(_021D6234, size, j, mask) == 1) {
                        vct_mix_audio(data, (s16 *)_021D6234, data, size);
                    }
                }
            }
        } else {
            MIi_CpuClearFast(0, data, size);
        }
    } else {
        MIi_CpuClearFast(0, data, size);
        result = 0;
    }
    if (sAudioEcho) {
        vct_set_speaker_samples(data, size);
    }
    return result;
}

s32 VCT_SetCodec(s32 codec) {
    if (codec >= 5) {
        return 0;
    }
    if (__vct.mode != 1 && (u32)codec <= 1) {
        return 0;
    }
    sAudioPacketSize = sCodecInfo[codec].blocks * 0x44 + sCodecInfo[codec].header + AUDIO_HEADER_SIZE;
    sAudioCodec = codec;
    sAdpcmState.sample = 0;
    sAdpcmState.index = 0;
    return 1;
}

void VCT_EnableVAD(s32 enable) {
    sEnableVAD = enable;
    VCT_ResetVAD();
    if (enable == 0) {
        sAudioFlag = 1;
    }
}

void VCT_EnableEchoCancel(s32 enable) {
    sAudioEcho = enable;
}

void *vct_prepare_send_buffer(void) {
    char *audio;
    AudioHeader *packet;
    u32 power, root;
    int mode;
    u32 pending;
    mode = sAudioCodec;
    pending = sSendInfo.write - sSendInfo.read;
    if (pending > 1) {
        sSendInfo.read = sSendInfo.write - 1;
        pending = 1;
    }
    if (!pending) {
        return 0;
    }
    packet = (AudioHeader *)(sSendInfo.buffer + ((sSendInfo.read & 1) ? 0 : 0x460));
    audio = (char *)packet + AUDIO_HEADER_SIZE;
    if (mode >= 2) {
        audio += 4;
    }
    power = HPFFilter((s16 *)audio, sAudioSize);
    // square root of the power with the hardware square root unit
    reg_CP_SQRTCNT = 0;
    reg_CP_SQRT_PARAM_L = power;
    while (reg_CP_SQRTCNT & 0x8000) {}
    root = reg_CP_SQRT_RESULT;
    if (sAudioEcho) {
        vct_process_fir(audio, sAudioSize, root);
    }
    packet->codec = mode;
    if (sEnableVAD) {
        int status = VCTi_GetVADStatus(power, root, NULL);
        sAudioVad = status;
        switch (status) {
        case 0:
            sSendInfo.read++;
            return 0;
        case 1:
            packet->codec |= 128;
            break;
        case 3:
            packet->kind = 0x41;
            break;
        default:
            break;
        }
    }
    if (!sEnableVAD && sAudioFlag) {
        {
            int zero = 0;
            u8 flags = packet->codec;
            sAudioFlag = zero;
            packet->codec = flags | 128;
        }
    }
    if (sAudioReset) {
        {
            int zero = 0;
            u8 flags = packet->codec;
            sAudioReset = zero;
            packet->codec = flags | 128;
        }
    }
    if (mode >= 2) {
        if (packet->codec & 128) {
            sAdpcmState.sample = 0;
            sAdpcmState.index = 0;
        }
        vct_encode_adpcm((u8 *)audio - sizeof(AdpcmState), (s16 *)audio, sAudioSize >> 1, &sAdpcmState, mode);
    } else if (mode == 1) {
        vct_encode_g711_ulaw((u8 *)audio, (s16 *)audio, sAudioSize >> 1);
    } else if (mode == 0) {
        vct_encode_8bit_raw((u8 *)audio, (s16 *)audio, sAudioSize >> 1);
    }
    {
        u32 mask = sAudioMask;
        sSendInfo.mask = mask;
        mask &= ~(1u << __vct.aid);
        sSendInfo.mask = mask;
        sSendInfo.balance = MATH_CountPopulation(mask) - 1;
    }
    if (sSendInfo.balance > 7) {
        return 0;
    }
    sSendInfo.balanceIndex = 0;
    return packet;
}

int vct_handle_audio(u32 sender, Header *data, u32 size, u64 ticks) {
    const AudioHeader *header = (const AudioHeader *)data;
    register AudioPacket *p;
    Stream *stream = 0;
    u32 i;
    int codec;
    void *destination;
    if (!sAudioSessions) {
        return 0;
    }
    for (i = 0; i < 3; i++) {
        if (sender == sStream[i].session) {
            stream = &sStream[i];
            break;
        }
    }
    if (!stream) {
        return 0;
    }
    if (header->kind == 0x41) {
        stream->silenceSeq = header->sequence;
        stream->baseStamp = 0;
        stream->skewSamples = 1;
        return 0;
    }
    if (header->kind != 0x40) {
        return 0;
    }
    codec = header->codec & 0x7F;
    stream->codec = codec;
    if (codec >= 5) {
        return 0;
    }
    if (size != 0x44 * sCodecInfo[codec].blocks + sCodecInfo[codec].header + AUDIO_HEADER_SIZE) {
        return 0;
    }
    if (!(sAudioMask & (sender ? (1 << sender) : 1))) {
        return 0;
    }
    p = vct_alloc_packet_buffer();
    if (!p) {
        vct_flush_audio_queue(stream->owner);
        vct_flush_decoder(stream->owner);
        p = vct_alloc_packet_buffer();
        if (!p) {
            vct_flush_all_audio_queue();
            vct_flush_all_decoder();
            p = vct_alloc_packet_buffer();
        }
        if (!p) {
            return 0;
        }
    }
    destination = (char *)p + 0x45c - (size - 12);
    MI_CpuCopy8((const u8 *)header + AUDIO_HEADER_SIZE, destination, size - AUDIO_HEADER_SIZE);
    p->channel = stream->owner;
    p->codec = codec;
    p->data = destination;
    p->size = size - 12;
    p->receive = ticks;
    p->owner = sender;
    p->flagged = header->codec & 0x80;
    p->timestamp = header->timestamp;
    p->sequence = header->sequence;
    if (!vct_calc_jitter_and_skew(stream, p)) {
        vct_free_packet_buffer(p);
        return 0;
    }
    vct_insert_decoder(p);
    return 1;
}

int vct_decode_audio_buffer(void) {
    int i, count, owner;
    OSIntrMode irq;
    AudioPacket *p = vct_top_decoder();
    if (!p) {
        return 0;
    }
    irq = OS_DisableInterrupts();
    owner = p->channel;
    count = vct_count_decoder_queue(owner);
    for (i = 0; i < count; i++) {
        p = vct_get_packet_from_decoder(owner);
        if (p->codec >= 2) {
            vct_decode_adpcm(p->data, (s16 *)p->samples, p->size, p->codec);
        } else if (p->codec == 1) {
            vct_decode_g711_ulaw(p->data, (s16 *)p->samples, p->size);
        } else {
            vct_decode_8bit_raw(p->data, (s16 *)p->samples, p->size);
        }
        p->data = p->samples;
        vct_remove_packet_from_decoder(p);
        if (vct_insert_audio_queue(p, p->channel) < 0) {
            vct_free_packet_buffer(p);
        }
    }
    OS_RestoreInterrupts(irq);
    return count;
}

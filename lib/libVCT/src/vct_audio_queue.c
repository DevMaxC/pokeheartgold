#include "vct/vct_decoder_internal.h"

// Audio queues (one per receive stream, ordered by sequence number), receive streams, sequence number
// tracking and the jitter / clock skew estimation that sets each packet's playout tick.

#pragma force_active on

void vct_init_audio_queue(u32 ch) {
    OSIntrMode enabled = OS_DisableInterrupts();
    gVctAudioQueueHead[ch] = gVctAudioQueueTail[ch] = NULL;
    gVctAudioQueueCount[ch] = 0;
    OS_RestoreInterrupts(enabled);
}

void vct_flush_audio_queue(u32 ch) {
    OSIntrMode irq = OS_DisableInterrupts();
    while (gVctAudioQueueHead[ch]) {
        AudioPacket *p = gVctAudioQueueHead[ch];
        AudioPacket *q = p->next;
        gVctAudioQueueHead[ch] = q;
        if (q) {
            q->prev = 0;
        }
        vct_free_packet_buffer(p);
    }
    gVctAudioQueueTail[ch] = 0;
    gVctAudioQueueCount[ch] = 0;
    OS_RestoreInterrupts(irq);
}

void vct_flush_all_audio_queue(void) {
    OSIntrMode irq = OS_DisableInterrupts();
    for (int ch = 0; ch < 3; ch++) {
        while (gVctAudioQueueHead[ch]) {
            AudioPacket *p = gVctAudioQueueHead[ch];
            AudioPacket *q = p->next;
            gVctAudioQueueHead[ch] = q;
            if (q) {
                q->prev = 0;
            }
            vct_free_packet_buffer(p);
        }
        gVctAudioQueueTail[ch] = 0;
        gVctAudioQueueCount[ch] = 0;
    }
    OS_RestoreInterrupts(irq);
}

int vct_insert_audio_queue(AudioPacket *p, u32 ch) {
    OSIntrMode irq;
    if (!p) {
        return -1;
    }
    if (ch >= 3) {
        return -1;
    }
    irq = OS_DisableInterrupts();
    if (!gVctAudioQueueHead[ch]) {
        gVctAudioQueueHead[ch] = p;
        p->prev = 0;
        gVctAudioQueueHead[ch]->next = 0;
        gVctAudioQueueTail[ch] = gVctAudioQueueHead[ch];
    } else {
        AudioPacket *q = gVctAudioQueueTail[ch];
        while (q) {
            if (q->sequence < p->sequence) {
                p->prev = q;
                p->next = q->next;
                q->next = p;
                if (p->next) {
                    p->next->prev = p;
                }
                if (q == gVctAudioQueueTail[ch]) {
                    gVctAudioQueueTail[ch] = p;
                }
                goto inserted;
            }
            q = q->prev;
        }
        {
            p->prev = 0;
            p->next = gVctAudioQueueHead[ch];
            gVctAudioQueueHead[ch]->prev = p;
            gVctAudioQueueHead[ch] = p;
        }
    }
inserted:
    gVctAudioQueueCount[ch]++;
    OS_RestoreInterrupts(irq);
    return gVctAudioQueueCount[ch];
}

AudioPacket *vct_top_audio_queue(u32 ch) {
    OSIntrMode irq = OS_DisableInterrupts();
    if (gVctAudioQueueHead[ch]) {
        OS_RestoreInterrupts(irq);
        return gVctAudioQueueHead[ch];
    }
    OS_RestoreInterrupts(irq);
    return 0;
}

u32 vct_pop_audio_queue(u32 ch) {
    OSIntrMode irq = OS_DisableInterrupts();
    if (gVctAudioQueueHead[ch]) {
        AudioPacket *q = gVctAudioQueueHead[ch]->next;
        gVctAudioQueueHead[ch] = q;
        gVctAudioQueueCount[ch]--;
        if (q) {
            q->prev = 0;
        } else {
            gVctAudioQueueTail[ch] = 0;
        }
    }
    OS_RestoreInterrupts(irq);
    return gVctAudioQueueCount[ch];
}

u32 vct_count_audio_queue(u32 ch) {
    return gVctAudioQueueCount[ch];
}

// session: aid of the session (-1 when the stream is not used)
void vct_init_stream(Stream *stream, u32 ch, u32 session) {
    MI_CpuFill8(stream, 0, 0x28);
    stream->playoutDelay = 79071;
    stream->oldDelay = 0;
    stream->delay = 0;
    stream->owner = ch;
    stream->session = session;
    stream->jitterAverage = 0;
    stream->skew = 0;
    stream->hold = 0;
    stream->lowerBound = 0;
    stream->upperBound = 79071;
    stream->boundCount = 0;
    stream->baseStamp = 0;
    stream->baseTick = 0;
    stream->skewSamples = 0;
    stream->skip = 0;
    stream->unk_50 = 0;
    stream->lastSeq = 0;
    stream->lastPlayed = 0;
    stream->needSeqInit = TRUE;
    stream->previous = NULL;
    stream->unk_40 = 0;
    stream->silenceSeq = 0;
}

void vct_reset_stream(Stream *stream) {
    if (stream->previous) {
        vct_free_packet_buffer(stream->previous);
        stream->previous = NULL;
    }
    stream->session = -1;
}

// Keeps the played packet (to be played again when the next one is late) and drops it from the queue.
u32 vct_save_previous_buffer(Stream *stream, AudioPacket *packet) {
    if (stream->previous) {
        vct_free_packet_buffer(stream->previous);
    }
    stream->previous = packet;
    return vct_pop_audio_queue(stream->owner);
}

void vct_init_sequence(Stream *stream, u32 seq) {
    stream->maxSeq = seq;
    stream->badSeq = 0x10001;
    stream->seqCycles = 0;
    stream->needSeqInit = FALSE;
}

// Extends the 16-bit sequence number of packet (seq) by the wrap count. FALSE: drop the packet.
int vct_update_sequence(Stream *stream, AudioPacket *packet, u32 seq) {
    u16 max = stream->maxSeq;
    u16 delta = seq - max;

    if (delta < 3000) {
        if (seq < max) {
            stream->seqCycles += 0x10000;
        }
        stream->maxSeq = seq;
    } else if (delta <= 0xFF9C) {
        if (seq == stream->badSeq) {
            vct_init_sequence(stream, seq);
            stream->lastSeq = (u16)(seq - 1);
        } else {
            stream->badSeq = (u16)(seq + 1);
            return FALSE;
        }
    } else {
        u32 extended = seq + stream->seqCycles;

        if (extended > stream->lastSeq + 0xFF9C) {
            packet->sequence = extended - 0x10000;
            return TRUE;
        }
    }
    packet->sequence = seq + stream->seqCycles;
    return TRUE;
}

int vct_calc_jitter_and_skew(Stream *s, AudioPacket *p) {
    u32 elapsed;
    s32 prev;
    s32 diff;
    s32 skew;
    int reset = 0;
    s32 delta;
    u64 now;
    s32 x;
    s32 d;

    if (s->needSeqInit) {
        vct_init_sequence(s, (u16)p->sequence); // the 16-bit sequence number (needed for the match)
    } else {
        if (vct_update_sequence(s, p, (u16)p->sequence) == 0) {
            s->lost++;
            return 0;
        }
        s->seq = p->sequence;
        if (s->lastSeq == p->sequence) {
            s->lost++;
            return 0;
        }
        if (s->lastSeq + 1 != p->sequence && p->flagged == 0) {
            delta = p->sequence - s->lastSeq;
            if (delta < 0) {
                delta = -delta;
            }
            if (delta > 100) {
                s->lastSeq = p->sequence;
                return 0;
            }
            if (s->lastSeq > p->sequence) {
                s->reordered++;
            }
        }
    }
    s->lastSeq = p->sequence;
    if (s->baseStamp == 0) {
        s->baseStamp = p->timestamp;
        s->baseTick = p->receive;
        s->skewSamples = 0;
    }
    elapsed = (p->timestamp - s->baseStamp) << 6;
    skew = elapsed - (s64)(p->receive - s->baseTick);
    prev = s->skew;
    if (prev == 0 || p->flagged != 0) {
        s->skew = skew;
    } else {
        s->skew = skew;
        diff = skew - prev;
        if (diff < 0) {
            diff = -diff;
        }
        if (diff > (s64)((s->jitterAverage + 35608) * 2) + 52365ULL) {
            s->hold = diff / 35608 + 2;
        }
        if (s->hold <= 0) {
            s->jitterAverage = s->jitterAverage + ((diff - s->jitterAverage) >> 4);
            s->jitterEstimate = s->jitterAverage;
        }
    }
    p->ready = elapsed + s->baseTick + s->playoutDelay;
    now = OS_GetTick();
    if (p->ready + 35608 < now) {
        return 0;
    }
    if (p->ready > now + 523656) {
        return 0;
    }
    if (s->hold <= 0) {
        x = s->jitterAverage * 3;
        d = x / 35608;
        if ((u32)x > s->upperBound) {
            s->upperBound = (d + 1) * 35608 + 79071;
            s->lowerBound = s->upperBound - 53412;
            s->playoutDelay = d * 35608 + 79071;
            s->boundCount = 0;
        } else if (x < s->lowerBound) {
            if (++s->boundCount > 70) {
                s->upperBound = (d + 1) * 35608 + 79071;
                s->lowerBound = (s32)((u32)d * 35608 - 17804);
                if (s->lowerBound < 0) {
                    s->lowerBound = 0;
                }
                s->playoutDelay = d * 35608 + 79071;
                s->boundCount = 0;
            }
        }
        if (s->playoutDelay > 427296) {
            s->playoutDelay = 427296;
        }
        if (s->skewSamples < 16) {
            s->skewSamples++;
            s->averageSkew = skew;
            s->startSkew = skew;
        } else {
            s->averageSkew = (s->averageSkew * 31 + skew) / 32;
        }
        s->drift = s->startSkew - s->averageSkew;
        if (s->drift > 34561) {
            reset = 1;
        }
        if (s->drift < -34561) {
            s->skip++;
            reset = -1;
        }
        if (reset) {
            s->skewSamples = 0;
            s->baseStamp = 0;
        }
    }
    s->hold--;
    return 1;
}

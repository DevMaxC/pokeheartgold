#include "vct/vct_decoder_internal.h"

// Decoder list: received audio packets of all streams in arrival order, waiting to be decoded.

#pragma force_active on

void vct_init_decoder(void) {
    OSIntrMode irq = OS_DisableInterrupts();
    s32 i;
    gVctDecoderList[1] = 0;
    gVctDecoderList[0] = 0;
    for (i = 0; i < 3; i++) {
        gVctDecoderCount[i] = 0;
    }
    OS_RestoreInterrupts(irq);
}

void vct_flush_decoder(u32 ch) {
    OSIntrMode irq = OS_DisableInterrupts();
    AudioPacket *p;
    while ((p = vct_get_packet_from_decoder(ch)) != 0) {
        vct_remove_packet_from_decoder(p);
        vct_free_packet_buffer(p);
    }
    gVctDecoderCount[ch] = 0;
    OS_RestoreInterrupts(irq);
}

void vct_flush_all_decoder(void) {
    OSIntrMode irq = OS_DisableInterrupts();
    AudioPacket *p = gVctDecoderList[0];
    while (p) {
        AudioPacket *q = p;
        p = p->next;
        vct_free_packet_buffer(q);
    }
    gVctDecoderList[0] = 0;
    gVctDecoderList[1] = 0;
    for (int i = 0; i < 3; i++) {
        gVctDecoderCount[i] = 0;
    }
    OS_RestoreInterrupts(irq);
}

u32 vct_insert_decoder(AudioPacket *p) {
    OSIntrMode irq = OS_DisableInterrupts();
    if (!gVctDecoderList[0]) {
        gVctDecoderList[0] = p;
        p->prev = 0;
        gVctDecoderList[0]->next = 0;
        gVctDecoderList[1] = gVctDecoderList[0];
    } else {
        p->prev = gVctDecoderList[1];
        p->next = 0;
        gVctDecoderList[1]->next = p;
        gVctDecoderList[1] = p;
    }
    gVctDecoderCount[p->channel]++;
    OS_RestoreInterrupts(irq);
    return gVctDecoderCount[p->channel];
}

AudioPacket *vct_top_decoder(void) {
    return gVctDecoderList[0];
}

int vct_count_decoder_queue(int ch) {
    return gVctDecoderCount[ch];
}

AudioPacket *vct_get_packet_from_decoder(int ch) {
    AudioPacket *p = gVctDecoderList[0];
    OSIntrMode irq = OS_DisableInterrupts();
    while (p) {
        if (p->channel == ch) {
            OS_RestoreInterrupts(irq);
            return p;
        }
        p = p->next;
    }
    OS_RestoreInterrupts(irq);
    return 0;
}

u32 vct_remove_packet_from_decoder(AudioPacket *p) {
    OSIntrMode irq = OS_DisableInterrupts();
    if (p->prev) {
        p->prev->next = p->next;
    } else {
        AudioPacket *q = p->next;
        gVctDecoderList[0] = q;
        if (q) {
            q->prev = 0;
        }
    }
    if (p->next) {
        p->next->prev = p->prev;
    } else {
        AudioPacket *q = p->prev;
        gVctDecoderList[1] = q;
        if (q) {
            q->next = 0;
        }
    }
    gVctDecoderCount[p->channel]--;
    OS_RestoreInterrupts(irq);
    return gVctDecoderCount[p->channel];
}

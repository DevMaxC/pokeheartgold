#include "vct/vct_ssp_internal.h"

// libVCT session protocol: sessions (create / delete / find), the request / response / notify
// packets and their state tables, and the handling of received SSP packets for client and server
// (transceiver mode) sessions.

#pragma force_active on

Session *VCT_CreateSession(u32 aid) {
    if (__vct.mode == 0 || __vct.mode == 2) {
        return 0;
    }
    return vct_create_session_impl(aid);
}

int VCT_DeleteSession(Session *s) {
    Session *prev = 0;
    Session *cur = gVctSsp.core.used;
    if (!s) {
        return 0;
    }
    if (__vct.mode == 2) {
        if (s == &gVctServerSession) {
            gVctSsp.server.state = 0;
        }
        return 1;
    }
    while (cur) {
        if (cur == s) {
            s->state = 0;
            if (prev) {
                prev->next = s->next;
            } else {
                if (cur->next) {
                    gVctSsp.core.used = cur->next;
                } else {
                    gVctSsp.core.used = 0;
                }
            }
            s->next = gVctSsp.core.free;
            gVctSsp.core.free = s;
            return 1;
        }
        prev = cur;
        cur = cur->next;
    }
    return 0;
}

int vct_build_request_data(Session *s, int kind, Header *b, u32 n) {
    if (!s) {
        return -1;
    }
    if (n < 16) {
        return -1;
    }
    if (__vct.state == 1) {
        return -3;
    }
    if (kind < 0 || kind >= 5) {
        return -3;
    }
    b->kind = SSP_KIND_REQUEST;
    vct_build_ssp_header(s, b, (u8)kind);
    if (!vct_check_send_state(s, b)) {
        return -3;
    }
    if (__vct.mode == 1 && kind == 0) {
        if (!vct_check_multisession(s)) {
            return -3;
        }
    }
    return 0;
}

int VCT_Request(Session *s, int kind) {
    if (__vct.mode == 2) {
        return -3;
    }
    return vct_request_impl(s, kind);
}

int vct_build_response_data(Session *s, int kind, Header *b, u32 n) {
    if (!s) {
        return -1;
    }
    if (n < 16) {
        return -1;
    }
    if (kind < 0 || kind >= 6) {
        return -3;
    }
    b->kind = SSP_KIND_RESPONSE;
    vct_build_ssp_header(s, b, (u8)kind);
    if (kind == 0) {
        if (__vct.mode == 1 && s->mode == 4) {
            if (!vct_check_multisession(s)) {
                return -3;
            }
        }
        s->mask = s->aid ? 1 << s->aid : 1;
    }
    if (!vct_check_send_state(s, b)) {
        return -3;
    }
    return 0;
}

int VCT_Response(Session *s, int kind) {
    if (__vct.mode == 2) {
        return -3;
    }
    return vct_response_impl(s, kind);
}

int VCT_AddConferenceClient(u8 aid) {
    Session *s;
    if (__vct.mode != 3) {
        return -2;
    }
    if (gVctSsp.core.count == 3) {
        return -6;
    }
    if (aid == __vct.aid) {
        return -1;
    }
    if (vct_find_session(aid)) {
        return 0;
    }
    s = VCT_CreateSession(aid);
    if (!s) {
        return -1;
    }
    s->aid = aid;
    s->other = aid;
    s->mode = 2;
    s->mask = 1 << aid;
    __vct.callback(aid, 7, s, __vct.context);
    gVctSsp.core.count++;
    return 0;
}

#pragma push
#pragma opt_strength_reduction off

static inline void LinkSessions(InitArgs *args) {
    u32 offset, index;
    index = 0;
    if (args->count - 1) {
        offset = 0;
        do {
            Session *base = gVctSsp.core.free;
            u8(*arena)[args->count * sizeof(Session)] = (void *)base;
            Session *current = (Session *)&(*arena)[offset];
            index++;
            current->next = base + index;
            offset += sizeof(Session);
        } while (index < args->count - 1);
    }
    gVctSsp.core.free[args->count - 1].next = NULL;
}

s32 vct_init_ssp(InitArgs *args) {
    Session *arena = args->data;
    if (!arena || !args->count || args->count > 8) {
        return 0;
    }
    gVctSsp.core.free = arena;
    MI_CpuFill8(arena, 0, args->count * sizeof(Session));
    MI_CpuFill8(&gVctServerSession, 0, sizeof(Session));
    MI_CpuFill8(&gVctRejectSession, 0, sizeof(Session));
    LinkSessions(args);
    gVctSsp.core.used = NULL;
    gVctSsp.core.mask = 0;
    gVctSsp.core.count = 0;
    __vct.flag = 0;
    gVctSsp.core.clock = OS_GetTick;
    gVctSsp.core.seed = 0x5d588b65;
    gVctSsp.core.add = 0x269ec3;
    return 1;
}

#pragma pop

void vct_finish_ssp(void) {
    gVctSsp.core.used = 0;
    gVctSsp.core.free = 0;
}

void vct_check_timeout(void) {
    u64 now = OS_GetTick();
    if (__vct.mode != 2) {
        return;
    }
    if (__vct.state == 0) {
        return;
    }
    if (gVctSsp.core.tick == 0) {
        return;
    }
    if (now - gVctSsp.core.tick <= sTransceiverLimit) {
        return;
    }
    gVctSsp.core.tick = 0;
    gVctSsp.server.state = 0;
    gVctSsp.server.mode = 0;
    vct_send_notify(0);
    __vct.callback(gVctSsp.server.aid, 9, &gVctServerSession, __vct.context);
}

int vct_handle_ssp(u32 aid, Header *b, u32 n, Event *arg) {
    if (n != SSP_PACKET_SIZE) {
        return 0;
    }
    if (b->id != aid || b->target != __vct.aid) {
        return 0;
    }
    if (b->size != SSP_PACKET_SIZE) {
        return vct_response_reject(b, arg);
    }
    if (__vct.state == 0) {
        return vct_handle_ssp_client(b, arg);
    }
    return vct_handle_ssp_server(b, arg);
}

Session *vct_create_session_impl(u32 aid) {
    Session *s;
    if (aid >= 32) {
        return 0;
    }
    if (aid == __vct.aid) {
        return 0;
    }
    s = gVctSsp.core.free;
    if (!s) {
        return 0;
    }
    gVctSsp.core.free = s->next;
    vct_init_session(s, aid);
    s->next = gVctSsp.core.used;
    gVctSsp.core.used = s;
    return s;
}

int vct_request_impl(Session *s, int kind) {
    Header b;
    int result = vct_build_request_data(s, kind, &b, SSP_PACKET_SIZE);
    if (result != 0) {
        return result;
    }
    return vct_send_ssp(s, &b) ? 0 : -4;
}

int vct_response_impl(Session *s, int kind) {
    Header b;
    int result = vct_build_response_data(s, kind, &b, SSP_PACKET_SIZE);
    if (result != 0) {
        return result;
    }
    return vct_send_ssp(s, &b) ? 0 : -4;
}

void vct_add_notify_aid_list(Session *s, Header *b) {
    if (b->notify != 1) {
        return;
    }
    b->peer = s->aid;
    b->mask = gVctSsp.core.mask;
}

int vct_send_notify_impl(Session *s, Header *b) {
    int count = 0;
    vct_add_notify_aid_list(s, b);
    for (u8 aid = 0; aid < 32; aid++) {
        u32 mask = aid ? 1 << aid : 1;
        if ((gVctSsp.core.mask & mask) && aid != __vct.aid) {
            b->target = aid;
            if (DWC_SendReliable(aid, b, SSP_PACKET_SIZE)) {
                count++;
            }
        }
    }
    if (b->notify == 1) {
        s->mask = gVctSsp.core.mask;
    } else if (b->notify == 0) {
        s->mask = 0;
    }
    if (count == 0) {
        return -4;
    }
    return 0;
}

void vct_send_notify(u32 kind) {
    Header b;
    b.kind = SSP_KIND_REQUEST;
    vct_build_ssp_header(&gVctServerSession, &b, SSP_REQUEST_NOTIFY);
    b.notify = kind;
    vct_send_notify_impl(&gVctServerSession, &b);
}

void vct_init_session(Session *session, u32 id) {
    memset(session, 0, sizeof(Session));
    session->state = __vct.mode;
    session->mode = 0;
    session->aid = id;
}

s32 vct_send_ssp(Session *session, Header *header) {
    if (header->kind == 255 && header->type == 4) {
        vct_send_notify_impl(session, header);
    } else if (!DWC_SendReliable(session->aid, header, 16)) {
        return 0;
    }
    return 1;
}

s32 vct_dispatch_session(Header *header, Session *session) {
    session->other = header->peer;
    if (header->kind == 255) {
        if (header->type == 0) {
            session->mask = session->aid ? 1 << session->aid : 1;
        }
        return sRequestEvent[header->type];
    }
    if (header->kind == 0) {
        if (header->type == 0) {
            if (session->mode == 1) {
                session->mask = session->aid ? 1 << session->aid : 1;
                return 7;
            }
            if (session->mode == 5) {
                return 9;
            }
            return 12;
        }
        return sResponseEvent[header->type];
    }
    return 12;
}

int vct_build_ssp_header(Session *s, Header *h, u32 kind) {
    h->magic = 0x5f564354;
    h->size = 16;
    h->type = kind;
    h->id = __vct.aid;
    h->target = s->aid;
    h->notify = 0;
    h->peer = __vct.aid;
    h->mask = 0;
    return 0;
}

int vct_check_recv_state(Session *s, Header *p) {
    int state;
    int index = p->type;

    if (!p->kind) {
        index += 5;
    }
    if (index < 0 || index >= 11) {
        index = -1;
    }
    if (index < 0) {
        return -1;
    }
    if (__vct.mode == 1) {
        state = sRecvState[s->mode][index];
    } else {
        state = sTransRecvState[s->mode][index];
    }
    switch (state) {
    case -1:
        return state;
    case -2:
        vct_response_impl(s, 1);
        s->mode = 0;
        s->state = 0;
        return state;
    case -3:
        vct_response_impl(s, 3);
        s->mode = 0;
        s->state = 0;
        return state;
    }
    return state;
}

s32 vct_check_multisession(Session *session) {
    Session *p = gVctSsp.core.used;
    while (p) {
        if (p->state != 0 && p->mode == 2 && session != p) {
            return 0;
        }
        p = p->next;
    }
    return 1;
}

int vct_check_send_state(Session *s, Header *p) {
    int state;
    int index = p->type;
    if (!p->kind) {
        index += 5;
    }
    if (index < 0 || index >= 11) {
        index = -1;
    }
    if (index < 0) {
        return -1;
    }
    state = s->mode;
    if (__vct.mode == 1) {
        state = sSendState[state][index];
    } else {
        state = sTransSendState[state][index];
    }
    if (state == -1) {
        return 1;
    }
    if (state == -2) {
        return 0;
    }
    s->mode = state;
    return 1;
}

Session *vct_find_session(u8 id) {
    Session *p = gVctSsp.core.used;
    if (__vct.mode == 2) {
        if (gVctSsp.server.state && gVctSsp.server.aid == id) {
            return &gVctServerSession;
        }
        return 0;
    }
    while (p) {
        if (p->state && p->aid == id) {
            return p;
        }
        p = p->next;
    }
    return 0;
}

s32 vct_handle_ssp_client(Header *header, Event *event) {
    Session *session;
    s32 state;
    if (header->kind == 255) {
        if (header->type == 4) {
            return vct_handle_notify(header, event);
        }
        if (header->type == 3) {
            return 0;
        }
    }
    session = vct_find_session(header->id);
    if (session) {
        state = vct_check_recv_state(session, header);
        switch (state) {
        case -1:
            return 0;
        case -2:
            event->event = 12;
            session->state = 0;
            event->session = session;
            return 1;
        }
        event->event = vct_dispatch_session(header, session);
        event->session = session;
        session->mode = state;
        return event->event != 0;
    }
    session = vct_create_session_impl(header->id);
    if (!session) {
        vct_init_session(&gVctRejectSession, header->id);
        vct_response_impl(&gVctRejectSession, 3);
        return 0;
    }
    state = vct_check_recv_state(session, header);
    if (state == -2 || state == -1) {
        VCT_DeleteSession(session);
        return 0;
    }
    event->event = vct_dispatch_session(header, session);
    event->session = session;
    session->mode = state;
    return event->event != 0;
}

s32 vct_handle_ssp_server(Header *header, Event *event) {
    s32 state;
    if (gVctSsp.server.state == 2) {
        if (gVctSsp.server.aid == header->id) {
            state = vct_check_recv_state(&gVctServerSession, header);
            switch (state) {
            case -2:
                event->event = 12;
                event->session = 0;
                return 1;
            case -3:
            case -1:
                return 0;
            }
            event->event = vct_dispatch_session(header, &gVctServerSession);
            event->session = &gVctServerSession;
            gVctServerSession.mode = state;
        } else {
            vct_send_notify(1);
            return 0;
        }
    } else {
        u8 id = header->id;
        u32 bit = id ? 1 << id : 1;
        if (!(gVctSsp.core.mask & bit)) {
            return 0;
        }
        gVctSsp.server.aid = id;
        gVctSsp.server.state = 2;
        gVctSsp.server.mode = 0;
        state = vct_check_recv_state(&gVctServerSession, header);
        switch (state) {
        case -3:
        case -2:
        case -1:
            gVctSsp.server.state = 0;
            return 0;
        }
        event->event = vct_dispatch_session(header, &gVctServerSession);
        event->session = &gVctServerSession;
        gVctServerSession.mode = state;
    }
    if (event->event == 10) {
        vct_send_notify(1);
        gVctSsp.core.tick = OS_GetTick();
    } else {
        vct_send_notify(0);
        gVctSsp.core.tick = 0;
    }
    return 1;
}

s32 vct_response_reject(Header *header, Event *event) {
    Session *session;
    if (header->kind == 255 && header->type == 4) {
        return 0;
    }
    session = vct_find_session(header->id);
    if (session) {
        event->event = 2;
        event->session = session;
        session->state = 0;
        vct_response_impl(session, 2);
        return 1;
    }
    vct_init_session(&gVctRejectSession, header->id);
    vct_response_impl(&gVctRejectSession, 2);
    return 0;
}

s32 vct_handle_notify(Header *header, Event *event) {
    if (__vct.mode != 2) {
        return 0;
    }
    if (__vct.peer != header->id) {
        return 0;
    }
    switch (header->notify) {
    case 0:
        if (!gVctSsp.server.state) {
            return 0;
        }
        if (gVctSsp.server.mode == 5 || gVctSsp.server.mode == 2) {
            event->event = 9;
        } else {
            event->event = 5;
        }
        gVctSsp.server.state = 0;
        gVctSsp.server.mode = 0;
        event->session = &gVctServerSession;
        break;
    case 1:
        gVctSsp.server.state = 2;
        if (header->peer == __vct.aid) {
            gVctSsp.server.mode = 2;
            event->event = 7;
            gVctSsp.server.mask = header->mask;
        } else {
            gVctSsp.server.mode = 3;
            event->event = 6;
            gVctSsp.server.mask = header->peer ? 1 << header->peer : 1;
        }
        gVctSsp.server.other = header->peer;
        event->session = &gVctServerSession;
        break;
    default:
        return 0;
    }
    return 1;
}

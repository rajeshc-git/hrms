#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <ctype.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/epoll.h>

#define DB_FILE_PATH "/data/contacts.db"
#define MAX_CONTACTS 4096
#define MAX_EVENTS 64
#define PORT 5678

#pragma pack(push, 1)
typedef struct {
    uint32_t id;
    uint8_t  active;
    char     name[64];
    char     phone[24];
    char     company[64];
    char     role[64];
    char     email[64];
    char     notes[160];
} ContactRecord;
#pragma pack(pop)

static ContactRecord g_contacts[MAX_CONTACTS];
static uint32_t g_contact_count = 0;
static uint32_t g_next_id = 1;
static int g_db_fd = -1;

#include "frontend_bundle.h"
#include "manifest_json.h"
#include "sw_js.h"

static void init_database(void) {
    mkdir("/data", 0755);
    g_db_fd = open(DB_FILE_PATH, O_RDWR | O_CREAT, 0644);
    if (g_db_fd < 0) g_db_fd = open("contacts.db", O_RDWR | O_CREAT, 0644);

    if (g_db_fd >= 0) {
        ContactRecord rec;
        while (read(g_db_fd, &rec, sizeof(ContactRecord)) == sizeof(ContactRecord)) {
            if (rec.id >= g_next_id) g_next_id = rec.id + 1;
            if (rec.active && g_contact_count < MAX_CONTACTS) g_contacts[g_contact_count++] = rec;
        }
    }

    if (g_contact_count == 0) {
        ContactRecord seeds[] = {
            { .id=1, .active=1, .name="Priya Sharma", .phone="+91 98765 43210", .company="TCS", .role="Head of Talent Acquisition", .email="priya.s@tcs.com", .notes="Campus & Lateral Cloud Engineers" },
            { .id=2, .active=1, .name="Rahul Verma", .phone="+91 98111 22334", .company="Infosys", .role="Senior Technical Recruiter", .email="rahul_v@infosys.com", .notes="Hiring Full-Stack & DevOps" },
            { .id=3, .active=1, .name="Ananya Iyer", .phone="+91 97400 55667", .company="Wipro", .role="Lead Recruiter - AI & ML", .email="ananya.iyer@wipro.com", .notes="GenAI & LLM Infra Hiring" },
            { .id=4, .active=1, .name="Karthik Nair", .phone="+91 98450 12345", .company="Zoho", .role="HR Business Partner", .email="karthik.n@zohocorp.com", .notes="Product Engineering & Systems" },
            { .id=5, .active=1, .name="Deepak Patel", .phone="+91 98250 88990", .company="HCLTech", .role="Talent Lead - Enterprise Solutions", .email="deepak.p@hcl.com", .notes="Hybrid Cloud Architects" }
        };
        for (size_t i = 0; i < sizeof(seeds)/sizeof(seeds[0]); i++) {
            g_contacts[g_contact_count++] = seeds[i];
            if (g_db_fd >= 0) write(g_db_fd, &seeds[i], sizeof(ContactRecord));
        }
        g_next_id = 6;
    }
}

static void persist_append(const ContactRecord *rec) {
    if (g_db_fd >= 0) { lseek(g_db_fd, 0, SEEK_END); write(g_db_fd, rec, sizeof(ContactRecord)); fdatasync(g_db_fd); }
}

static void persist_tombstone(uint32_t id) {
    if (g_db_fd < 0) return;
    lseek(g_db_fd, 0, SEEK_SET);
    ContactRecord rec; off_t off = 0;
    while (read(g_db_fd, &rec, sizeof(ContactRecord)) == sizeof(ContactRecord)) {
        if (rec.id == id && rec.active) {
            rec.active = 0; lseek(g_db_fd, off, SEEK_SET);
            write(g_db_fd, &rec, sizeof(ContactRecord)); fdatasync(g_db_fd); break;
        }
        off += sizeof(ContactRecord);
    }
}

static void json_str(const char *json, const char *key, char *dest, size_t dlen) {
    if (!json || !key || !dest || !dlen) return;
    dest[0] = '\0';
    char pat[64]; snprintf(pat, sizeof(pat), "\"%s\"", key);
    const char *p = strstr(json, pat);
    if (!p) return;
    p += strlen(pat);
    while (*p && (isspace((unsigned char)*p) || *p == ':')) p++;
    if (*p != '"') return;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i < dlen - 1) {
        if (*p == '\\' && *(p+1)) p++;
        dest[i++] = *p++;
    }
    dest[i] = '\0';
}

static void write_all(int fd, const void *data, size_t len) {
    const uint8_t *p = (const uint8_t *)data;
    size_t sent = 0;
    while (sent < len) {
        ssize_t w = write(fd, p + sent, len - sent);
        if (w <= 0) {
            if (w < 0 && (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)) continue;
            break;
        }
        sent += (size_t)w;
    }
}

static void handle_client(int fd) {
    char buf[8192];
    ssize_t n = read(fd, buf, sizeof(buf) - 1);
    if (n <= 0) { close(fd); return; }
    buf[n] = '\0';

    if (strncmp(buf, "OPTIONS ", 8) == 0) {
        const char *r = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,DELETE,OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n";
        write_all(fd, r, strlen(r)); close(fd); return;
    }

    /* Serve PWA manifest.json */
    if (strncmp(buf, "GET /manifest.json", 18) == 0 && (buf[18] == ' ' || buf[18] == '?')) {
        char hdr[256]; int hl = snprintf(hdr, sizeof(hdr), "HTTP/1.1 200 OK\r\nContent-Type: application/manifest+json\r\nCache-Control: no-cache\r\nConnection: close\r\nContent-Length: %zu\r\n\r\n", MANIFEST_JSON_LEN);
        write_all(fd, hdr, hl); write_all(fd, MANIFEST_JSON_DATA, MANIFEST_JSON_LEN); close(fd); return;
    }

    /* Serve PWA service worker */
    if (strncmp(buf, "GET /sw.js", 10) == 0 && (buf[10] == ' ' || buf[10] == '?')) {
        char hdr[256]; int hl = snprintf(hdr, sizeof(hdr), "HTTP/1.1 200 OK\r\nContent-Type: application/javascript\r\nService-Worker-Allowed: /\r\nCache-Control: no-cache\r\nConnection: close\r\nContent-Length: %zu\r\n\r\n", SW_JS_LEN);
        write_all(fd, hdr, hl); write_all(fd, SW_JS_DATA, SW_JS_LEN); close(fd); return;
    }

    if (strncmp(buf, "GET /api/contacts", 17) == 0) {
        char hdr[256]; snprintf(hdr, sizeof(hdr), "HTTP/1.1 200 OK\r\nContent-Type: application/json;charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n");
        write(fd, hdr, strlen(hdr)); write(fd, "[", 1);
        char item[512]; bool first = true;
        for (uint32_t i = 0; i < g_contact_count; i++) {
            ContactRecord *r = &g_contacts[i]; if (!r->active) continue;
            int l = snprintf(item, sizeof(item), "%s{\"id\":%u,\"name\":\"%s\",\"phone\":\"%s\",\"company\":\"%s\",\"role\":\"%s\",\"email\":\"%s\",\"notes\":\"%s\"}", first?"":"," , r->id, r->name, r->phone, r->company, r->role, r->email, r->notes);
            first = false; write(fd, item, l);
        }
        write(fd, "]", 1); close(fd); return;
    }

    if (strncmp(buf, "POST /api/contacts", 18) == 0) {
        char *body = strstr(buf, "\r\n\r\n"); if (body) body += 4; else body = "";
        if (g_contact_count >= MAX_CONTACTS) { const char *r = "HTTP/1.1 507 Insufficient Storage\r\nConnection: close\r\n\r\n"; write(fd, r, strlen(r)); close(fd); return; }
        ContactRecord nr; memset(&nr, 0, sizeof(nr)); nr.id = g_next_id++; nr.active = 1;
        json_str(body, "name", nr.name, sizeof(nr.name));
        json_str(body, "phone", nr.phone, sizeof(nr.phone));
        json_str(body, "company", nr.company, sizeof(nr.company));
        json_str(body, "role", nr.role, sizeof(nr.role));
        json_str(body, "email", nr.email, sizeof(nr.email));
        json_str(body, "notes", nr.notes, sizeof(nr.notes));
        g_contacts[g_contact_count++] = nr; persist_append(&nr);
        char resp[512]; int l = snprintf(resp, sizeof(resp), "HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"id\":%u,\"name\":\"%s\",\"phone\":\"%s\",\"company\":\"%s\",\"role\":\"%s\",\"email\":\"%s\",\"notes\":\"%s\"}", nr.id, nr.name, nr.phone, nr.company, nr.role, nr.email, nr.notes);
        write(fd, resp, l); close(fd); return;
    }

    if (strncmp(buf, "DELETE /api/contacts/", 21) == 0) {
        uint32_t tid = (uint32_t)strtoul(buf + 21, NULL, 10);
        bool found = false;
        for (uint32_t i = 0; i < g_contact_count; i++) {
            if (g_contacts[i].id == tid && g_contacts[i].active) {
                g_contacts[i].active = 0; persist_tombstone(tid);
                for (uint32_t j = i; j < g_contact_count - 1; j++) g_contacts[j] = g_contacts[j+1];
                g_contact_count--; found = true; break;
            }
        }
        const char *r = found
            ? "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"success\":true}"
            : "HTTP/1.1 404 Not Found\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"error\":\"Not found\"}";
        write(fd, r, strlen(r)); close(fd); return;
    }

    /* Default: serve embedded gzipped frontend */
    char hdr[256]; int hl = snprintf(hdr, sizeof(hdr), "HTTP/1.1 200 OK\r\nContent-Type: text/html;charset=utf-8\r\nContent-Encoding: gzip\r\nCache-Control: no-cache\r\nConnection: close\r\nContent-Length: %zu\r\n\r\n", EMBEDDED_BUNDLE_GZ_LEN);
    write_all(fd, hdr, hl); write_all(fd, EMBEDDED_BUNDLE_GZ, EMBEDDED_BUNDLE_GZ_LEN); close(fd);
}

int main(int argc, char *argv[]) {
    int port = PORT;
    if (argc > 1) { int p = atoi(argv[1]); if (p > 0) port = p; }
    init_database();

    int sfd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
    if (sfd < 0) { perror("socket"); return 1; }
    int opt = 1; setsockopt(sfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = { .sin_family = AF_INET, .sin_addr.s_addr = INADDR_ANY, .sin_port = htons(port) };
    if (bind(sfd, (struct sockaddr *)&addr, sizeof(addr)) < 0) { perror("bind"); return 1; }
    if (listen(sfd, 128) < 0) { perror("listen"); return 1; }

    int efd = epoll_create1(0);
    struct epoll_event ev = { .events = EPOLLIN, .data.fd = sfd };
    epoll_ctl(efd, EPOLL_CTL_ADD, sfd, &ev);
    struct epoll_event events[MAX_EVENTS];

    for (;;) {
        int nfds = epoll_wait(efd, events, MAX_EVENTS, -1);
        for (int i = 0; i < nfds; i++) {
            if (events[i].data.fd == sfd) {
                struct sockaddr_in ca; socklen_t cl = sizeof(ca);
                int cfd = accept(sfd, (struct sockaddr *)&ca, &cl);
                if (cfd >= 0) handle_client(cfd);
            }
        }
    }
    return 0;
}

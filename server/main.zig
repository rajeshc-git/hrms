const std = @import("std");
const net = std.net;

// -----------------------------------------------------------------------------
// Core Architecture & Constraints:
// Target RSS: < 1MB (~200KB - 500KB on Linux x86_64/aarch64).
// Zero-runtime static asset embedding via @embedFile.
// Zero-copy append-only binary record store on mounted volume (/data/contacts.db)
// -----------------------------------------------------------------------------

const DB_FILE_PATH = "/data/contacts.db";
const MAX_CONTACTS = 4096;

pub const ContactRecord = extern struct {
    id: u32,
    active: u8,
    name: [64]u8,
    phone: [24]u8,
    company: [64]u8,
    role: [64]u8,
    email: [64]u8,
    notes: [160]u8,
};

// Embedded gzipped frontend bundle generated during build stage
const embedded_html_gz = @embedFile("frontend_bundle.gz");

var contacts_table: [MAX_CONTACTS]ContactRecord = undefined;
var contact_count: usize = 0;
var next_id: u32 = 1;
var db_file: ?std.fs.File = null;

fn initDatabase() !void {
    std.fs.cwd().makePath("/data") catch {};
    db_file = std.fs.cwd().openFile(DB_FILE_PATH, .{ .mode = .read_write }) catch |err| switch (err) {
        error.FileNotFound => std.fs.cwd().createFile(DB_FILE_PATH, .{ .read = true }) catch null,
        else => null,
    };

    if (db_file) |f| {
        const reader = f.reader();
        while (reader.readStruct(ContactRecord)) |rec| {
            if (rec.id >= next_id) next_id = rec.id + 1;
            if (rec.active == 1 and contact_count < MAX_CONTACTS) {
                contacts_table[contact_count] = rec;
                contact_count += 1;
            }
        } else |_| {}
    }

    if (contact_count == 0) {
        seedInitialContacts();
    }
}

fn seedInitialContacts() void {
    const seeds = [_]struct { n: []const u8, p: []const u8, c: []const u8, r: []const u8, e: []const u8, no: []const u8 }{
        .{ .n = "Priya Sharma", .p = "+91 98765 43210", .c = "TCS", .r = "Head of TA", .e = "priya.s@tcs.com", .no = "Campus & Cloud" },
        .{ .n = "Rahul Verma", .p = "+91 98111 22334", .c = "Infosys", .r = "Lead Recruiter", .e = "rahul_v@infosys.com", .no = "Full-Stack Hiring" },
        .{ .n = "Ananya Iyer", .p = "+91 97400 55667", .c = "Wipro", .r = "AI / ML TA Lead", .e = "ananya@wipro.com", .no = "GenAI & Systems" },
    };

    for (seeds) |s| {
        var rec: ContactRecord = std.mem.zeroes(ContactRecord);
        rec.id = next_id;
        next_id += 1;
        rec.active = 1;
        @memcpy(rec.name[0..s.n.len], s.n);
        @memcpy(rec.phone[0..s.p.len], s.p);
        @memcpy(rec.company[0..s.c.len], s.c);
        @memcpy(rec.role[0..s.r.len], s.r);
        @memcpy(rec.email[0..s.e.len], s.e);
        @memcpy(rec.notes[0..s.no.len], s.no);

        contacts_table[contact_count] = rec;
        contact_count += 1;

        if (db_file) |f| {
            f.seekFromEnd(0) catch {};
            f.writeAll(std.mem.asBytes(&rec)) catch {};
        }
    }
}

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("⚡ Starting Bharat HR Zig Ultra-Low RSS Server on 0.0.0.0:8080\n", .{});
    try stdout.print("📦 Embedded Gzip Frontend Size: {d} bytes\n", .{embedded_html_gz.len});

    try initDatabase();

    const address = net.Address.parseIp4("0.0.0.0", 8080) catch unreachable;
    var server = try address.listen(.{ .reuse_address = true });
    defer server.deinit();

    while (true) {
        const conn = try server.accept();
        handleConnection(conn) catch {};
    }
}

fn handleConnection(conn: net.Server.Connection) !void {
    defer conn.stream.close();

    var buffer: [4096]u8 = undefined;
    const bytes_read = try conn.stream.read(&buffer);
    if (bytes_read == 0) return;

    const request = buffer[0..bytes_read];

    if (std.mem.startsWith(u8, request, "GET /api/contacts")) {
        try handleGetContacts(conn.stream.writer());
    } else if (std.mem.startsWith(u8, request, "POST /api/contacts")) {
        try handlePostContact(request, conn.stream.writer());
    } else if (std.mem.startsWith(u8, request, "DELETE /api/contacts/")) {
        try handleDeleteContact(request, conn.stream.writer());
    } else {
        // Serve embedded pre-gzipped frontend bundle directly from flash memory
        const headers =
            "HTTP/1.1 200 OK\r\n" ++
            "Content-Type: text/html; charset=utf-8\r\n" ++
            "Content-Encoding: gzip\r\n" ++
            "Cache-Control: public, max-age=3600\r\n" ++
            "Connection: close\r\n\r\n";
        try conn.stream.writer().writeAll(headers);
        try conn.stream.writer().writeAll(embedded_html_gz);
    }
}

fn handleGetContacts(writer: anytype) !void {
    try writer.writeAll(
        "HTTP/1.1 200 OK\r\n" ++
        "Content-Type: application/json; charset=utf-8\r\n" ++
        "Access-Control-Allow-Origin: *\r\n" ++
        "Connection: close\r\n\r\n["
    );

    var first = true;
    for (contacts_table[0..contact_count]) |r| {
        if (r.active != 1) continue;
        if (!first) try writer.writeAll(",") else first = false;

        const name = std.mem.sliceTo(&r.name, 0);
        const phone = std.mem.sliceTo(&r.phone, 0);
        const company = std.mem.sliceTo(&r.company, 0);
        const role = std.mem.sliceTo(&r.role, 0);
        const email = std.mem.sliceTo(&r.email, 0);
        const notes = std.mem.sliceTo(&r.notes, 0);

        try writer.print(
            "{{\"id\":{d},\"name\":\"{s}\",\"phone\":\"{s}\",\"company\":\"{s}\",\"role\":\"{s}\",\"email\":\"{s}\",\"notes\":\"{s}\"}}",
            .{ r.id, name, phone, company, role, email, notes }
        );
    }
    try writer.writeAll("]");
}

fn handlePostContact(request: []const u8, writer: anytype) !void {
    if (contact_count >= MAX_CONTACTS) {
        try writer.writeAll("HTTP/1.1 507 Insufficient Storage\r\n\r\n");
        return;
    }

    const body_start = std.mem.indexOf(u8, request, "\r\n\r\n") orelse {
        try writer.writeAll("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
    };
    const body = request[body_start + 4 ..];

    var rec: ContactRecord = std.mem.zeroes(ContactRecord);
    rec.id = next_id;
    next_id += 1;
    rec.active = 1;

    extractJsonField(body, "name", &rec.name);
    extractJsonField(body, "phone", &rec.phone);
    extractJsonField(body, "company", &rec.company);
    extractJsonField(body, "role", &rec.role);
    extractJsonField(body, "email", &rec.email);
    extractJsonField(body, "notes", &rec.notes);

    contacts_table[contact_count] = rec;
    contact_count += 1;

    if (db_file) |f| {
        f.seekFromEnd(0) catch {};
        f.writeAll(std.mem.asBytes(&rec)) catch {};
    }

    const name = std.mem.sliceTo(&rec.name, 0);
    const phone = std.mem.sliceTo(&rec.phone, 0);
    const company = std.mem.sliceTo(&rec.company, 0);
    const role = std.mem.sliceTo(&rec.role, 0);
    const email = std.mem.sliceTo(&rec.email, 0);
    const notes = std.mem.sliceTo(&rec.notes, 0);

    try writer.print(
        "HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n" ++
        "{{\"id\":{d},\"name\":\"{s}\",\"phone\":\"{s}\",\"company\":\"{s}\",\"role\":\"{s}\",\"email\":\"{s}\",\"notes\":\"{s}\"}}",
        .{ rec.id, name, phone, company, role, email, notes }
    );
}

fn handleDeleteContact(request: []const u8, writer: anytype) !void {
    const prefix = "DELETE /api/contacts/";
    const after = request[prefix.len..];
    const end_idx = std.mem.indexOfAny(u8, after, " \r\n?") orelse after.len;
    const id_str = after[0..end_idx];
    const target_id = std.fmt.parseInt(u32, id_str, 10) catch {
        try writer.writeAll("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
    };

    var found = false;
    for (0..contact_count) |i| {
        if (contacts_table[i].id == target_id and contacts_table[i].active == 1) {
            contacts_table[i].active = 0;
            // Shift active records
            var j = i;
            while (j < contact_count - 1) : (j += 1) {
                contacts_table[j] = contacts_table[j + 1];
            }
            contact_count -= 1;
            found = true;
            break;
        }
    }

    if (found) {
        try writer.writeAll("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"success\":true}");
    } else {
        try writer.writeAll("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Not found\"}");
    }
}

fn extractJsonField(json: []const u8, key: []const u8, dest: []u8) void {
    var search_buf: [128]u8 = undefined;
    const search = std.fmt.bufPrint(&search_buf, "\"{s}\":\"", .{key}) catch return;
    const start_idx = (std.mem.indexOf(u8, json, search) orelse return) + search.len;
    const end_idx = std.mem.indexOf(u8, json[start_idx..], "\"") orelse return;
    const val = json[start_idx .. start_idx + end_idx];
    const len = @min(val.len, dest.len - 1);
    @memcpy(dest[0..len], val[0..len]);
}

import { randomBytes } from "node:crypto";
import Database from "../Database/Database.mjs";
import { UserRoles } from "./constants.mjs";

const db = Database.getInstance();

const parseCookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie || "").split(";").map((c) => {
      const i = c.trim().indexOf("=");
      return [c.trim().slice(0, i), c.trim().slice(i + 1)];
    }),
  );

const TOKEN_COOKIE_BY_ROLE = {
  [UserRoles.CUSTOMER]: "customerToken",
  [UserRoles.COURRIER]: "courrierToken",
  [UserRoles.MANAGER]: "managerToken",
};

const getTokenCookieName = (role) => TOKEN_COOKIE_BY_ROLE[role] ?? "token";

const buildTokenCookie = (token, role) =>
  `${getTokenCookieName(role)}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=3600`;

export const buildClearTokenCookie = (role) =>
  `${getTokenCookieName(role)}=; HttpOnly; Path=/; Max-Age=0`;

// generates a random session token, stores it in the Session table, sets it as an httpOnly cookie
export const issueToken = async (res, user, role) => {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO Session (token, userId, role, userEmail, restaurantName) VALUES (?, ?, ?, ?, ?)",
    [token, user.userId, role, user.email ?? null, user.restaurantName ?? null],
  );
  res.setHeader("Set-Cookie", buildTokenCookie(token, role));
};

// reads the session token from the request cookie, looks it up in the DB, and returns the session row
export const verifyToken = async (req, expectedRole = null) => {
  const cookies = parseCookies(req);
  const token = expectedRole ? cookies[getTokenCookieName(expectedRole)] : cookies.token;
  if (!token) throw new Error("No token found");

  const [rows] = await db.query("SELECT * FROM Session WHERE token = ?", [token]);
  if (!rows.length) throw new Error("Invalid or expired session");
  if (expectedRole && rows[0].role !== expectedRole) throw new Error("Session role mismatch");

  return rows[0];
};

// deletes the session from the DB, invalidating the token server-side
export const revokeToken = async (req, role = null) => {
  const cookies = parseCookies(req);
  const token = role ? cookies[getTokenCookieName(role)] : cookies.token;
  if (token) await db.query("DELETE FROM Session WHERE token = ?", [token]);
};

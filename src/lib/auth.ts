import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
export type Session={sub:string,email:string,role:"ADMIN"|"MANAGER"|"EDITOR",name:string};
const secret=()=>new TextEncoder().encode(process.env.JWT_SECRET||"development-secret-change-this-now");
export async function createSession(session:Session){return new SignJWT(session).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(secret())}
export async function getSession(){const token=(await cookies()).get("session")?.value;if(!token)return null;try{return (await jwtVerify(token,secret())).payload as unknown as Session}catch{return null}}
export function allow(session:Session|null,roles:Session["role"][]){return !!session&&roles.includes(session.role)}


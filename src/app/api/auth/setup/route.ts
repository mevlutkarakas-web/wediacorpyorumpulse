import { NextResponse } from "next/server";

export async function POST(){return NextResponse.json({error:"Hesapları yalnızca admin oluşturabilir."},{status:403})}

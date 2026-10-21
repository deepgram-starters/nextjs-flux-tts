import { NextResponse } from "next/server";
export function GET() { return NextResponse.json({ title: "Next.js Flux Text-to-Speech", useCase: "flux-text-to-speech", language: "javascript", framework: "nextjs", sdk: "@deepgram/sdk" }); }

import { spawn } from 'child_process';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  // Security guard: Only allow running E2E suites locally in dev environments!
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }

  const encoder = new TextEncoder();

  // Create a ReadableStream so the client can receive console logs chunk-by-chunk in real time!
  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn('node', ['scripts/verify-feature.js', '--local-only'], {
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      proc.stdout.on('data', (data) => {
        controller.enqueue(encoder.encode(data.toString()));
      });

      proc.stderr.on('data', (data) => {
        controller.enqueue(encoder.encode(data.toString()));
      });

      proc.on('close', (code) => {
        controller.enqueue(encoder.encode(`\n[Process completed with exit code ${code}]\n`));
        controller.close();
      });

      proc.on('error', (err) => {
        controller.enqueue(encoder.encode(`\n[Process error: ${err.message}]\n`));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}

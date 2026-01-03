import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();
    
    // Send command to AXDaemon running on localhost:17831
    const response = await fetch('http://127.0.0.1:17831/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    
    const result = await response.json();
    
    return NextResponse.json({ 
      success: true, 
      result 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

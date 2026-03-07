import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// In-memory storage for demo purposes
// Replace with actual database in production
let notes: any[] = [];
let nextId = 1;

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Filter notes by user
    const userNotes = notes.filter(note => note.user_id === session.user.id);

    return NextResponse.json({ notes: userNotes });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json(
      { message: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json(
        { message: "Title and content are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const newNote = {
      id: String(nextId++),
      title,
      content,
      user_id: session.user.id,
      created_at: now,
      updated_at: now,
    };

    notes.push(newNote);

    return NextResponse.json({ note: newNote }, { status: 201 });
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { message: "Failed to create note" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, title, content } = body;

    if (!id || !title || !content) {
      return NextResponse.json(
        { message: "ID, title, and content are required" },
        { status: 400 }
      );
    }

    const noteIndex = notes.findIndex(
      note => note.id === id && note.user_id === session.user.id
    );

    if (noteIndex === -1) {
      return NextResponse.json(
        { message: "Note not found" },
        { status: 404 }
      );
    }

    notes[noteIndex] = {
      ...notes[noteIndex],
      title,
      content,
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json({ note: notes[noteIndex] });
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { message: "Failed to update note" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { message: "Note ID is required" },
        { status: 400 }
      );
    }

    const noteIndex = notes.findIndex(
      note => note.id === id && note.user_id === session.user.id
    );

    if (noteIndex === -1) {
      return NextResponse.json(
        { message: "Note not found" },
        { status: 404 }
      );
    }

    notes.splice(noteIndex, 1);

    return NextResponse.json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { message: "Failed to delete note" },
      { status: 500 }
    );
  }
}

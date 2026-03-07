import useSWR from "swr";
import { toast } from "sonner";
import type { Note, CreateNoteInput, UpdateNoteInput } from "@/types/notes";

interface NotesResponse {
  notes: Note[];
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch notes");
  }
  return response.json();
};

export function useNotes() {
  const { data, error, isLoading, mutate } = useSWR<NotesResponse>(
    "/api/notes",
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  const createNote = async (input: CreateNoteInput) => {
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create note");
      }

      const result = await response.json();
      toast.success("Note created successfully");
      
      // Optimistically update the local data
      mutate();
      
      return result.note;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create note";
      toast.error(message);
      throw error;
    }
  };

  const updateNote = async (input: UpdateNoteInput) => {
    try {
      const response = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update note");
      }

      const result = await response.json();
      toast.success("Note updated successfully");
      
      // Optimistically update the local data
      mutate();
      
      return result.note;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update note";
      toast.error(message);
      throw error;
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const response = await fetch(`/api/notes?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete note");
      }

      toast.success("Note deleted successfully");
      
      // Optimistically update the local data
      mutate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete note";
      toast.error(message);
      throw error;
    }
  };

  return {
    notes: data?.notes || [],
    isLoading,
    error,
    createNote,
    updateNote,
    deleteNote,
    mutate,
  };
}

"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  X,
  Check,
  AlertTriangle,
  RefreshCw,
  Trash2,
  FileText,
  Image as ImageIcon,
  File,
  Plus,
} from "lucide-react";

export type FileUploadStatus = "pending" | "uploading" | "done" | "error";

export interface FileUploadItem {
  id: string;
  file: File;
  status: FileUploadStatus;
  progress: number;
  speed?: number; // bytes per second
  error?: string;
}

interface FileUploadProps {
  onUpload?: (files: File[]) => Promise<void>;
  onFileChange?: (files: FileUploadItem[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in bytes
  className?: string;
  autoUpload?: boolean; // If false, just collect files without uploading
}

export function FileUpload({
  onUpload,
  onFileChange,
  accept,
  multiple = true,
  maxSize,
  className,
  autoUpload = true,
}: FileUploadProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadProgressRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const hasTriggeredAutoUpload = useRef<Set<string>>(new Set());
  const onFileChangeRef = useRef(onFileChange);
  const prevFileIdsRef = useRef<Set<string>>(new Set());

  // Keep ref updated
  useEffect(() => {
    onFileChangeRef.current = onFileChange;
  }, [onFileChange]);

  // Notify parent of file changes only when files are added/removed (not status changes)
  useEffect(() => {
    const currentFileIds = new Set(files.map((f) => f.id));
    const prevFileIds = prevFileIdsRef.current;

    // Check if files were added or removed (not just status changed)
    const filesChanged =
      currentFileIds.size !== prevFileIds.size ||
      Array.from(currentFileIds).some((id) => !prevFileIds.has(id)) ||
      Array.from(prevFileIds).some((id) => !currentFileIds.has(id));

    if (filesChanged) {
      prevFileIdsRef.current = currentFileIds;
      onFileChangeRef.current?.(files);
    }
  }, [files]);

  useEffect(() => {
    const progressIntervals = uploadProgressRefs.current;
    return () => {
      progressIntervals.forEach((interval) => clearInterval(interval));
      progressIntervals.clear();
    };
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatFileSize(bytesPerSecond)}/sec`;
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return ImageIcon;
    }
    if (file.type === "application/pdf") {
      return FileText;
    }
    return File;
  };

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const validateFile = (file: File): string | null => {
        if (maxSize && file.size > maxSize) {
          return `File size exceeds ${formatFileSize(maxSize)}`;
        }
        return null;
      };

      const validFiles: FileUploadItem[] = [];
      const errors: string[] = [];

      Array.from(newFiles).forEach((file) => {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          validFiles.push({
            id: `${Date.now()}-${Math.random()}`,
            file,
            status: "pending",
            progress: 0,
          });
        }
      });

      if (errors.length > 0) {
        console.warn("File validation errors:", errors);
      }

      if (validFiles.length > 0) {
        setFiles((prev) => (multiple ? [...prev, ...validFiles] : validFiles));
      }
    },
    [maxSize, multiple]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      addFiles(Array.from(selectedFiles));
    }
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleBrowseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const simulateUpload = (fileItem: FileUploadItem): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const fileSize = fileItem.file.size;
      let uploaded = 0;
      const interval = 100; // Update every 100ms

      const uploadInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const speed = uploaded / elapsed || 0;

        // Simulate upload progress (you'll replace this with actual upload logic)
        uploaded += (fileSize * 0.05); // Simulate 5% progress per interval
        const progress = Math.min((uploaded / fileSize) * 100, 99);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  progress,
                  speed,
                  status: "uploading" as FileUploadStatus,
                }
              : f
          )
        );

        if (progress >= 99) {
          clearInterval(uploadInterval);
          uploadProgressRefs.current.delete(fileItem.id);

          // Simulate completion
          setTimeout(() => {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileItem.id
                  ? { ...f, progress: 100, status: "done" as FileUploadStatus }
                  : f
              )
            );
            resolve();
          }, 200);
        }
      }, interval);

      uploadProgressRefs.current.set(fileItem.id, uploadInterval);

      // Simulate random errors (remove in production)
      if (Math.random() < 0.1) {
        clearInterval(uploadInterval);
        uploadProgressRefs.current.delete(fileItem.id);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  status: "error" as FileUploadStatus,
                  error: "Upload failed. Please try again.",
                }
              : f
          )
        );
        reject(new Error("Upload failed"));
      }
    });
  };

  const startUpload = useCallback(async () => {
    // Use functional update to get current files without dependency
    setFiles((currentFiles) => {
      const pendingFiles = currentFiles.filter((f) => f.status === "pending");
      if (pendingFiles.length === 0) {
        return currentFiles;
      }

      // Mark as uploading immediately
      setIsUploading(true);

      // If onUpload is provided, use it; otherwise simulate
      if (onUpload) {
        (async () => {
          try {
            const fileList = pendingFiles.map((f) => f.file);
            await onUpload(fileList);
            // Mark all as done
            setFiles((prev) =>
              prev.map((f) =>
                f.status === "pending"
                  ? { ...f, status: "done" as FileUploadStatus, progress: 100 }
                  : f
              )
            );
          } catch (error) {
            // Mark all as error
            setFiles((prev) =>
              prev.map((f) =>
                f.status === "pending"
                  ? {
                      ...f,
                      status: "error" as FileUploadStatus,
                      error: error instanceof Error ? error.message : "Upload failed",
                    }
                  : f
              )
            );
          } finally {
            setIsUploading(false);
          }
        })();
      } else {
        // Simulate uploads
        (async () => {
          const uploadPromises = pendingFiles.map((fileItem) => simulateUpload(fileItem));
          await Promise.allSettled(uploadPromises);
          setIsUploading(false);
        })();
      }

      // Return updated files with uploading status
      return currentFiles.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as FileUploadStatus } : f
      );
    });
  }, [onUpload]);

  // Track previous files length to detect new additions
  const prevFilesLengthRef = useRef(0);

  // Auto-start upload when files are added (only if autoUpload is enabled)
  useEffect(() => {
    if (!autoUpload || isUploading) {
      prevFilesLengthRef.current = files.length;
      return;
    }

    // Only trigger if files were actually added (length increased)
    if (files.length <= prevFilesLengthRef.current) {
      prevFilesLengthRef.current = files.length;
      return;
    }

    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) {
      prevFilesLengthRef.current = files.length;
      return;
    }

    // Find files that haven't been triggered yet
    const newPendingFiles = pendingFiles.filter(
      (f) => !hasTriggeredAutoUpload.current.has(f.id)
    );

    if (newPendingFiles.length === 0) {
      prevFilesLengthRef.current = files.length;
      return;
    }

    // Mark these files as triggered
    newPendingFiles.forEach((f) => {
      hasTriggeredAutoUpload.current.add(f.id);
    });

    prevFilesLengthRef.current = files.length;

    const timer = setTimeout(() => {
      startUpload();
    }, 500);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, isUploading, autoUpload]);

  const handleRetry = (fileItem: FileUploadItem, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileItem.id
          ? { ...f, status: "pending" as FileUploadStatus, progress: 0, error: undefined }
          : f
      )
    );
    // Remove from triggered set so it can be uploaded again
    hasTriggeredAutoUpload.current.delete(fileItem.id);
    // Auto-start upload if not already uploading
    if (!isUploading && autoUpload) {
      setTimeout(() => startUpload(), 100);
    }
  };

  const handleCancel = (fileItem: FileUploadItem) => {
    const interval = uploadProgressRefs.current.get(fileItem.id);
    if (interval) {
      clearInterval(interval);
      uploadProgressRefs.current.delete(fileItem.id);
    }
    hasTriggeredAutoUpload.current.delete(fileItem.id);
    setFiles((prev) => prev.filter((f) => f.id !== fileItem.id));
  };

  const handleDelete = (fileItem: FileUploadItem, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    hasTriggeredAutoUpload.current.delete(fileItem.id);
    setFiles((prev) => prev.filter((f) => f.id !== fileItem.id));
  };

  const handleCancelAll = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    uploadProgressRefs.current.forEach((interval) => clearInterval(interval));
    uploadProgressRefs.current.clear();
    setFiles((prev) => prev.filter((f) => f.status === "done"));
    setIsUploading(false);
  };

  const hasActiveUploads = files.some(
    (f) => f.status === "uploading" || (f.status === "pending" && autoUpload)
  );
  const hasFiles = files.length > 0;
  const allPending = files.length > 0 && files.every((f) => f.status === "pending");
  const showUploadView = hasFiles && (!autoUpload || !allPending || files.some((f) => f.status !== "pending"));

  // Show upload progress view if there are files
  if (showUploadView) {
    return (
      <div
        className={cn(
          "w-full max-w-2xl mx-auto  shadow-sm p-4 md:p-6",
          className
        )}
      >
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-1 md:mb-2">
            {hasActiveUploads ? "Uploading..." : allPending && !autoUpload ? "Selected Files" : "Upload Complete"}
          </h2>
          {hasActiveUploads && (
            <p className="text-sm md:text-base text-muted-foreground">
              It may take a while. Please Wait.
            </p>
          )}
          {allPending && !autoUpload && (
            <p className="text-sm md:text-base text-muted-foreground">
              Files will be uploaded when you submit the form.
            </p>
          )}
        </div>

        {/* File List */}
        <div className="space-y-3 md:space-y-4 mb-4 md:mb-6">
          {files.map((fileItem) => {
            const FileIcon = getFileIcon(fileItem.file);
            const isDone = fileItem.status === "done";
            const isError = fileItem.status === "error";
            const isUploading = fileItem.status === "uploading";
            const isPending = fileItem.status === "pending";

            return (
              <div
                key={fileItem.id}
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-lg border bg-background"
              >
                {/* File Icon */}
                <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded bg-muted flex items-center justify-center">
                  <FileIcon className="w-5 h-5 md:w-6 md:h-6 text-muted-foreground" />
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm md:text-base font-medium text-foreground truncate">
                      {fileItem.file.name}
                    </p>
                    <span className="text-muted-foreground">·</span>
                    <p className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
                      {formatFileSize(fileItem.file.size)}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  {(isUploading || isError) && (
                    <div className="mb-2">
                      <div className="w-full h-1.5 md:h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all duration-300",
                            isError
                              ? "bg-destructive"
                              : "bg-primary"
                          )}
                          style={{
                            width: `${fileItem.progress}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {isDone && (
                      <>
                        <Check className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        <span className="text-xs md:text-sm text-primary font-medium">
                          Done
                        </span>
                      </>
                    )}
                    {isError && (
                      <>
                        <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
                        <span className="text-xs md:text-sm text-destructive font-medium">
                          Error
                        </span>
                      </>
                    )}
                    {isUploading && (
                      <>
                        <span className="text-xs md:text-sm text-foreground font-medium">
                          {Math.round(fileItem.progress)}% done
                        </span>
                        {fileItem.speed && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-xs md:text-sm text-muted-foreground">
                              {formatSpeed(fileItem.speed)}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isError && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleRetry(fileItem, e)}
                      className="h-8 px-3 text-xs md:text-sm"
                    >
                      <RefreshCw className="w-3 h-3 md:w-4 md:h-4 mr-1.5" />
                      <span className="hidden sm:inline">Retry</span>
                    </Button>
                  )}
                  {(isUploading || isError) && (
                    <button
                      onClick={() => handleCancel(fileItem)}
                      className="p-1.5 md:p-2 hover:bg-muted rounded-md transition-colors"
                      aria-label="Cancel upload"
                    >
                      <X className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                    </button>
                  )}
                  {isDone && (
                    <button
                      onClick={() => handleDelete(fileItem)}
                      className="p-1.5 md:p-2 hover:bg-muted rounded-md transition-colors"
                      aria-label="Delete file"
                    >
                      <Trash2 className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                    </button>
                  )}
                  {isPending && !autoUpload && (
                    <button
                      onClick={() => handleDelete(fileItem)}
                      className="p-1.5 md:p-2 bg-green-600 rounded-md transition-colors"
                      aria-label="Remove file"
                    >
                      <X className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add More Files Button */}
        <div className="mb-4 md:mb-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleBrowseClick}
            className="w-full md:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add More Files
          </Button>
        </div>

        {/* Footer Actions */}
        {hasActiveUploads && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelAll}
              className="w-full md:w-auto min-w-[120px]"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Auto-start upload when files are added (only if autoUpload is enabled) */}
        {autoUpload && files.some((f) => f.status === "pending") && !isUploading && (
          <div className="mt-4 flex justify-center">
            <Button type="button" onClick={startUpload} className="w-full md:w-auto">
              Start Upload
            </Button>
          </div>
        )}

        {/* Hidden File Input - Available in upload view too */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>
    );
  }

  // Show initial upload view
  return (
    <div
      className={cn(
        "w-full max-w-2xl mx-auto bg-card rounded-lg border shadow-sm p-4 md:p-6 lg:p-8",
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 md:mb-6 text-center">
        
        <p className="text-sm md:text-xl text-blue-700">
          Select and upload scanned documents.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 md:p-8 lg:p-12 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 bg-muted/30"
        )}
      >
        <p className="text-base md:text-lg font-medium text-foreground mb-3 md:mb-4">
          Drag files to upload
        </p>
        <p className="text-xs md:text-sm text-muted-foreground mb-4 md:mb-6">
          or
        </p>
        <Button
          type="button"
          onClick={handleBrowseClick}
          className="px-6 md:px-8 py-2 md:py-3"
        >
          Browse file
        </Button>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
}

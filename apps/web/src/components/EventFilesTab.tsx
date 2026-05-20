'use client';

import { useState, useEffect } from 'react';
import { FileText, Upload, Trash2, Download, Clock, User, FileImage, FileVideo, FileText as FilePdf } from 'lucide-react';

interface File {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  comment: string | null;
  createdAt: string;
  uploadedBy: {
    id: string;
    name: string;
    email: string;
  };
}

interface EventFilesTabProps {
  eventId: string;
}

export default function EventFilesTab({ eventId }: EventFilesTabProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchFiles();
  }, [eventId]);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/v2/events/${eventId}/files`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (128MB)
      const maxSize = 128 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('Arquivo muito grande. O tamanho máximo é 128MB.');
        return;
      }
      setSelectedFile(file as any);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile as any);
      if (comment.trim()) {
        formData.append('comment', comment);
      }

      const res = await fetch(`http://localhost:3001/api/v2/events/${eventId}/files/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setFiles([data.file, ...files]);
        setSelectedFile(null);
        setComment('');
      } else {
        const error = await res.json();
        alert(error.error || 'Erro ao fazer upload');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Tem certeza que deseja excluir este arquivo?')) return;

    try {
      const res = await fetch(`http://localhost:3001/api/v2/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setFiles(files.filter(f => f.id !== fileId));
      } else {
        alert('Erro ao excluir arquivo');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Erro ao excluir arquivo');
    }
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/v2/files/${fileId}/download`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        // Open the download URL in a new tab
        window.open(data.downloadUrl, '_blank');
      } else {
        alert('Erro ao baixar arquivo');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Erro ao baixar arquivo');
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <FileImage className="text-blue-500" />;
    if (mimeType.startsWith('video/')) return <FileVideo className="text-purple-500" />;
    if (mimeType === 'application/pdf') return <FilePdf className="text-red-500" />;
    return <FileText className="text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="space-y-4">
      {/* Upload Form */}
      <div className="bg-white rounded-lg shadow p-4">
        <form onSubmit={handleUpload} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">
              Selecionar Arquivo (PDF, Vídeo, Imagem - Máx 128MB)
            </label>
            <input
              type="file"
              onChange={handleFileSelect}
              accept=".pdf,image/*,video/*"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
              disabled={uploading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Comentário (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Adicione um comentário sobre este arquivo..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              rows={2}
              disabled={uploading}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Upload size={16} />
              {uploading ? 'Enviando...' : 'Enviar Arquivo'}
            </button>
          </div>
        </form>
      </div>

      {/* Files List */}
      <div className="space-y-3">
        {files.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-muted-foreground">
            <FileText className="mx-auto h-12 w-12 mb-3 opacity-50" />
            <p>Nenhum arquivo anexado ainda.</p>
          </div>
        ) : (
          files.map((file) => (
            <div key={file.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    {getFileIcon(file.mimeType)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</span>
                  </div>
                  {file.comment && (
                    <p className="text-sm text-muted-foreground mb-2">{file.comment}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User size={12} />
                    <span>{file.uploadedBy.name}</span>
                    <span>({file.uploadedBy.email})</span>
                    <Clock size={12} />
                    <span>{formatDate(file.createdAt)}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex gap-1">
                  <button
                    onClick={() => handleDownload(file.id, file.name)}
                    className="p-1 text-muted-foreground hover:text-primary transition"
                    title="Baixar"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

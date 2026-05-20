'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { formatDate, formatFileSize } from '@/lib/utils';
import { FileText, Upload, ArrowLeft, Download, Trash2, Image, File } from 'lucide-react';

interface EventFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: { name: string };
}

export default function EventFilesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [files, setFiles] = useState<EventFile[]>([]);
  const [event, setEvent] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [eventId]);

  async function loadData() {
    try {
      setLoading(true);
      // TODO: Add API endpoint for event files
      setEvent({ id: eventId, name: 'Evento Exemplo' });
      setFiles([
        {
          id: '1',
          name: 'contrato.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024 * 1024 * 2.5,
          uploadedAt: '2024-01-20T10:00:00Z',
          uploadedBy: { name: 'Admin' },
        },
        {
          id: '2',
          name: 'logo_evento.png',
          mimeType: 'image/png',
          sizeBytes: 1024 * 512,
          uploadedAt: '2024-01-19T14:30:00Z',
          uploadedBy: { name: 'João' },
        },
      ]);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Erro ao carregar arquivos');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;

    setUploading(true);
    try {
      // TODO: Implement S3 presigned URL upload
      for (const file of selectedFiles) {
        console.log('Uploading:', file.name);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm('Tem certeza que deseja excluir este arquivo?')) return;
    
    try {
      // TODO: Add delete file API
      setFiles(files.filter(f => f.id !== fileId));
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir arquivo');
    }
  }

  function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return <Image className="size-5 text-muted-foreground" />;
    return <File className="size-5 text-muted-foreground" />;
  }

  const totalSize = files.reduce((acc, f) => acc + f.sizeBytes, 0);

  return (
    <Layout>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Voltar para evento
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
              Arquivos
            </h1>
            <p className="text-muted-foreground">
              {event?.name} • {files.length} arquivos • {formatFileSize(totalSize)}
            </p>
          </div>
          <label className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Upload className="size-4" />
            {uploading ? 'Enviando...' : 'Upload'}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Files List */}
      <div className="bg-card rounded-lg border shadow-sm">
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-destructive">{error}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <FileText className="size-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-2">Nenhum arquivo enviado.</p>
              <label className="text-primary hover:underline cursor-pointer">
                Clique para fazer upload
                <input type="file" className="hidden" onChange={handleUpload} />
              </label>
            </div>
          ) : (
            <div className="divide-y">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(file.sizeBytes)} • Enviado por {file.uploadedBy.name} • {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
                      title="Download"
                    >
                      <Download className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition"
                      title="Excluir"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

'use client';

import { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function FileUploader() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [duplicates, setDuplicates] = useState<string[]>([]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStatus('idle');
            setMessage('');
            setDuplicates([]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/schedule/import', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (res.ok) {
                setStatus('success');
                setMessage(data.message || 'Arquivo importado com sucesso!');
                if (data.duplicates && data.duplicates.length > 0) {
                    setDuplicates(data.duplicates);
                }
                setFile(null); // Reset file input
            } else {
                setStatus('error');
                setMessage(data.error || 'Erro na importação.');
            }
        } catch (error) {
            setStatus('error');
            setMessage('Erro de conexão com o servidor.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md max-w-xl mx-auto">
            <div className="text-center mb-6">
                <Upload className="mx-auto h-12 w-12 text-blue-500" />
                <h2 className="mt-2 text-lg font-medium text-gray-900">Importar Escala</h2>
                <p className="text-sm text-gray-500">Selecione um arquivo PDF ou Excel (.xlsx)</p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {file ? (
                                <>
                                    <FileText className="w-8 h-8 text-green-500 mb-2" />
                                    <p className="text-sm text-gray-700 font-medium">{file.name}</p>
                                </>
                            ) : (
                                <>
                                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Clique para selecionar</span></p>
                                    <p className="text-xs text-gray-500">PDF, XLSX (MAX. 10MB)</p>
                                </>
                            )}
                        </div>
                        <input type="file" className="hidden" accept=".pdf, .xlsx, .xls, .csv" onChange={handleFileChange} />
                    </label>
                </div>

                {status === 'error' && (
                    <div className="flex items-center text-red-600 bg-red-50 p-3 rounded">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        <span className="text-sm">{message}</span>
                    </div>
                )}

                {status === 'success' && (
                    <div className="space-y-2">
                        <div className="flex items-center text-green-600 bg-green-50 p-3 rounded">
                            <CheckCircle className="w-5 h-5 mr-2" />
                            <span className="text-sm">{message}</span>
                        </div>

                        {duplicates.length > 0 && (
                            <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                                <div className="flex items-center text-yellow-800 mb-2">
                                    <AlertCircle className="w-5 h-5 mr-2" />
                                    <span className="font-bold text-sm">Atenção: {duplicates.length} Veículos Duplicados Ignorados</span>
                                </div>
                                <ul className="list-disc list-inside text-xs text-yellow-700 max-h-32 overflow-y-auto">
                                    {duplicates.map((d, i) => (
                                        <li key={i}>{d}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className={`w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
            ${!file || uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}`}
                >
                    {uploading ? (
                        <>
                            <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                            Processando...
                        </>
                    ) : (
                        'Enviar Arquivo'
                    )}
                </button>
            </div>
        </div>
    );
}

import FileUploader from '@/components/importer/FileUploader';

export default function ImportPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Nova Importação</h1>
            <FileUploader />

            {/* 
        Ideally showing previous imports history here as well.
        For now just the uploader.
      */}
        </div>
    );
}

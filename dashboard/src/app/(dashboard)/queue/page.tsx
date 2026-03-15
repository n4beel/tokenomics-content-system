export default function QueuePage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Publishing Queue</h2>
        <p className="text-gray-400 mt-1">
          Review and approve content before publishing
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-gray-500 text-lg">📤 No content in queue yet</p>
        <p className="text-gray-600 text-sm mt-2">
          Run a batch to generate content for review
        </p>
      </div>
    </div>
  );
}

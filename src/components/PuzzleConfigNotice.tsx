export default function PuzzleConfigNotice() {
  return (
    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-md">
      <div className="font-semibold">Puzzle configuration missing</div>
      <div className="text-sm">The puzzle address and range must be configured in the database via the setup page.</div>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[28px] border border-ember/20 bg-ember/10 p-6 text-sm text-ember">
      {message}
    </div>
  );
}

export const metadata = {
  title: 'Aaromach',
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary">
      {children}
    </div>
  );
}

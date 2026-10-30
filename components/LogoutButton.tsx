'use client';

import { signOut } from 'next-auth/react';
import { Button } from './ui/button';
import { LogOut } from 'lucide-react'; // Assuming you have lucide-react installed for icons

export default function LogoutButton() {
  return (
    <Button
      variant="ghost"
      onClick={() => signOut({ callbackUrl: '/login' })}
      aria-label="Logout"
      className="justify-start text-muted-foreground hover:text-foreground"
    >
      <LogOut className="w-4 h-4" />
      {/* Icon only on a phone, where the top bar has no room for the word. */}
      <span className="hidden sm:inline">Logout</span>
    </Button>
  );
}

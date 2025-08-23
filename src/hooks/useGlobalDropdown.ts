import { create } from 'zustand';

interface GlobalDropdownState {
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  closeAll: () => void;
}

export const useGlobalDropdown = create<GlobalDropdownState>((set) => ({
  openDropdown: null,
  setOpenDropdown: (id: string | null) => set({ openDropdown: id }),
  closeAll: () => set({ openDropdown: null }),
}));

export const useDropdownState = (id: string) => {
  const { openDropdown, setOpenDropdown } = useGlobalDropdown();
  
  const isOpen = openDropdown === id;
  
  const toggle = () => {
    if (isOpen) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(id);
    }
  };
  
  const close = () => setOpenDropdown(null);
  
  return { isOpen, toggle, close };
};
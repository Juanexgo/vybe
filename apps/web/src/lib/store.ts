import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
export const useProfile = create<{
  selected: string | null;
  select: (id: string | null) => void;
}>()(
  persist(
    (set) => ({ selected: null, select: (selected) => set({ selected }) }),
    {
      name: "vybe-profile-v1",
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
    },
  ),
);

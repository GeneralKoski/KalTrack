export interface AdminMe {
    handle: string;
    displayName: string;
    email: string;
    isAdmin: boolean;
}

export interface Stats {
    users: number;
    pending: { exercises: number; foods: number };
    published: { exercises: number; foods: number };
    missing: { instructions: number; photos: number };
}

export interface Paginato<T> {
    data: T[];
    meta: { total: number; page: number; lastPage: number };
}

export interface Elenco<T> {
    data: T[];
}

export interface ExerciseRow {
    id: number;
    uid: string;
    name: string;
    muscleGroup: string;
    secondaryMuscles: string | null;
    equipment: string | null;
    instructions: string | null;
    photo: string | null;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface FoodRow {
    id: number;
    uid: string;
    name: string;
    brand: string | null;
    barcode: string | null;
    offId: string | null;
    kcal: number;
    protein: number | null;
    carbs: number | null;
    sugars: number | null;
    fat: number | null;
    saturatedFat: number | null;
    fiber: number | null;
    salt: number | null;
    isLiquid: boolean;
    defaultServingG: number | null;
    servingLabel: string | null;
    image: string | null;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface TaxonomyRow {
    id: number;
    slug: string;
    labelIt: string;
    labelEn: string;
    sort: number;
}

export type TaxonomyKind = 'muscle-groups' | 'equipment';

export type SubmissionType = 'exercise' | 'food';

export interface SubmissionRow {
    id: number;
    type: SubmissionType;
    uid: string;
    name: string;
    status: string;
    reviewNote: string | null;
    createdAt: string | null;
    author: { handle: string; displayName: string } | null;
    /*
     * I campi dipendono dal tipo, e il server li manda in un oggetto a parte
     * apposta. `unknown` e non `any`: chi li legge sa gia' che tipo sta
     * guardando e li restringe li'.
     */
    fields: Record<string, unknown>;
}

export interface UserRow {
    id: number;
    handle: string;
    displayName: string;
    email: string;
    isAdmin: boolean;
    aiEnabled: boolean;
    createdAt: string | null;
    submitted: number;
    published: number;
}

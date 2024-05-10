import {SupabaseClient} from "npm:@supabase/supabase-js";

export const response = {
    info: (info: string) => {
        return new Response(JSON.stringify({info}), {headers: {"Content-Type": "application/json"}, status: 200});
    },
    data: (data: any) => {
        return new Response(JSON.stringify(data), {headers: {"Content-Type": "application/json"}, status: 200});
    },
    error: (error: any) => {
        return new Response(JSON.stringify({error}), {headers: {"Content-Type": "application/json"}, status: 500});
    }
}

export async function parseRequest(req: Request, supabase: SupabaseClient) {
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const {data} = await supabase.auth.getUser(token);
    const user = data.user;
    try {
        const body = await req.json()
        return {user, body};
    }catch{}
    return {user};
}

'use client'

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader, CardFooter } from "./ui/card"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import FormField from "./FormField"

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginCard() {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema)
    })

    const onSubmit = async (data: LoginFormData) => {
        setIsLoading(true)
        setError(null)

        const result = await signIn("credentials", {
            email: data.email,
            password: data.password,
            redirect: false,
        })

        if (result?.error) {
            setError("Invalid email or password")
            setIsLoading(false)
        } else {
            router.push("/dashboard")
            router.refresh()
        }
    }

    return (
        <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="flex flex-col justify-center items-center pt-8">
                <img src="/124-job-tracking.svg" className="w-16 h-16 mb-2" alt="Logo"/>
                <h3 className="text-2xl font-bold tracking-tight">Welcome back</h3>
                <p className="text-sm text-muted-foreground">Log in to your Shortlist account</p>
            </CardHeader>

            <CardContent>
                <Button 
                    variant="outline" 
                    className="w-full h-10 flex gap-2"
                    onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                >
                    <svg
                        viewBox="0 0 48 48"
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                    >
                        <path
                            d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
                            fill="#4285F4"
                        />
                        <path
                            d="M6.3 14.7l6.6 4.8C14.7 16.1 19.1 14 24 14c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 7.6 29.6 5.5 24 5.5c-7.6 0-14.2 4-17.7 9.2z"
                            fill="#EA4335"
                        />
                        <path
                            d="M24 42.5c5.9 0 10.9-2.1 14.8-5.7l-6.9-5.4c-2.1 1.4-4.7 2.2-7.9 2.2-6.1 0-11.2-4.1-13-9.6l-6.8 5.3C7.9 36.8 15.3 42.5 24 42.5z"
                            fill="#34A853"
                        />
                        <path
                            d="M11 24c0-1.5.3-2.9.8-4.2l-6.8-5.3C3.5 17.1 2.5 20.4 2.5 24s1 6.9 2.5 9.5l6.8-5.3c-.5-1.3-.8-2.7-.8-4.2z"
                            fill="#FBBC05"
                        />
                    </svg>
                    Continue with Google
                </Button>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {error && (
                        <p className="text-sm font-medium text-destructive text-center bg-destructive/10 py-2 rounded">
                            {error}
                        </p>
                    )}
                    
                    <FormField id="login-email" label="Email" error={errors.email?.message}>
                        <Input
                            id="login-email"
                            type="email"
                            placeholder="name@example.com"
                            autoComplete="email"
                            aria-invalid={!!errors.email}
                            aria-describedby={errors.email ? "login-email-error" : undefined}
                            {...register("email")}
                        />
                    </FormField>

                    <FormField id="login-password" label="Password" error={errors.password?.message}>
                        <Input
                            id="login-password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete="current-password"
                            aria-invalid={!!errors.password}
                            aria-describedby={errors.password ? "login-password-error" : undefined}
                            {...register("password")}
                        />
                    </FormField>

                    <Button type="submit" className="w-full h-10" disabled={isLoading}>
                        {isLoading ? "Logging in..." : "Log in"}
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="flex justify-center">
                    <p className="text-sm text-muted-foreground">
                        Don&apos;t have an account? {" "} <a href="/register" className="text-primary font-medium hover:underline">Register</a>
                    </p>
            </CardFooter>
        </Card>
    )
}

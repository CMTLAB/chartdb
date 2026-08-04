import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ChartDBLogo from '@/assets/logo-light.png';
import { Button } from '@/components/button/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import { Input } from '@/components/input/input';
import { useAuth } from '@/context/auth-context/auth-context';

export const LoginPage = () => {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (user) {
            navigate(user.mustChangePassword ? '/change-password' : '/', {
                replace: true,
            });
        }
    }, [user, navigate]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            const signedIn = await login(username, password);
            navigate(signedIn.mustChangePassword ? '/change-password' : '/', {
                replace: true,
            });
        } catch (loginError) {
            setError(
                loginError instanceof Error
                    ? loginError.message
                    : '로그인에 실패했습니다.'
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="items-center gap-4">
                    <img src={ChartDBLogo} alt="ChartDB" className="h-7" />
                    <CardTitle>사내 ERD 로그인</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={submit}>
                        <label className="block space-y-1 text-sm">
                            <span>아이디</span>
                            <Input
                                value={username}
                                onChange={(event) =>
                                    setUsername(event.target.value)
                                }
                                autoComplete="username"
                                required
                                autoFocus
                            />
                        </label>
                        <label className="block space-y-1 text-sm">
                            <span>비밀번호</span>
                            <Input
                                type="password"
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                                autoComplete="current-password"
                                required
                            />
                        </label>
                        {error ? (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        ) : null}
                        <Button className="w-full" disabled={submitting}>
                            {submitting ? '로그인 중…' : '로그인'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
};

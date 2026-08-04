import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/button/button';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import { Input } from '@/components/input/input';
import { useAuth } from '@/context/auth-context/auth-context';

export const ChangePasswordPage = () => {
    const { changePassword } = useAuth();
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (newPassword.length < 12) {
            setError('새 비밀번호는 12자 이상이어야 합니다.');
            return;
        }
        if (newPassword !== confirmation) {
            setError('새 비밀번호가 일치하지 않습니다.');
            return;
        }
        try {
            await changePassword(currentPassword, newPassword);
            navigate('/login', { replace: true });
        } catch (changeError) {
            setError(
                changeError instanceof Error
                    ? changeError.message
                    : '비밀번호 변경에 실패했습니다.'
            );
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>비밀번호 변경</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        계속하려면 임시 비밀번호를 변경하세요.
                    </p>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={submit}>
                        <label className="block space-y-1 text-sm">
                            <span>현재 비밀번호</span>
                            <Input
                                type="password"
                                value={currentPassword}
                                onChange={(event) =>
                                    setCurrentPassword(event.target.value)
                                }
                                autoComplete="current-password"
                                required
                            />
                        </label>
                        <label className="block space-y-1 text-sm">
                            <span>새 비밀번호</span>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={(event) =>
                                    setNewPassword(event.target.value)
                                }
                                autoComplete="new-password"
                                minLength={12}
                                required
                            />
                        </label>
                        <label className="block space-y-1 text-sm">
                            <span>새 비밀번호 확인</span>
                            <Input
                                type="password"
                                value={confirmation}
                                onChange={(event) =>
                                    setConfirmation(event.target.value)
                                }
                                autoComplete="new-password"
                                minLength={12}
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
                        <Button className="w-full">변경 후 다시 로그인</Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
};

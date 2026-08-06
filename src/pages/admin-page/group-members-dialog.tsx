import React, { useMemo, useState } from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/alert-dialog/alert-dialog';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/dialog/dialog';
import { apiFetch } from '@/lib/api';

import { AssignmentPicker, type AssignmentOption } from './assignment-picker';
import type { AdminGroup, AdminUser } from './admin-types';

interface GroupMembersDialogProps {
    group: AdminGroup;
    users: AdminUser[];
    onSaved: (group: AdminGroup) => void;
}

const sameIds = (left: Set<string>, right: Set<string>) =>
    left.size === right.size && [...left].every((id) => right.has(id));

export const GroupMembersDialog = ({
    group,
    users,
    onSaved,
}: GroupMembersDialogProps) => {
    const initialIds = useMemo(() => new Set(group.userIds), [group.userIds]);
    const options = useMemo<AssignmentOption[]>(
        () =>
            users.map((user) => ({
                id: user.id,
                primary: user.displayName,
                secondary: [`@${user.username}`, user.department]
                    .filter(Boolean)
                    .join(' · '),
                badges: [user.role, ...(!user.active ? ['비활성'] : [])],
                disabled: !user.active && !initialIds.has(user.id),
            })),
        [initialIds, users]
    );
    const [open, setOpen] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const [userIds, setUserIds] = useState(initialIds);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const dirty = !sameIds(userIds, initialIds);

    const reset = () => {
        setUserIds(new Set(group.userIds));
        setError('');
    };
    const requestClose = () => {
        if (saving) return;
        if (dirty) setDiscardOpen(true);
        else setOpen(false);
    };
    const setDialogOpen = (nextOpen: boolean) => {
        if (nextOpen) {
            reset();
            setOpen(true);
        } else requestClose();
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const response = await apiFetch<{ group: AdminGroup }>(
                `/api/admin/groups/${group.id}/members`,
                {
                    method: 'PUT',
                    body: JSON.stringify({ userIds: [...userIds] }),
                }
            );
            onSaved(response.group);
            setOpen(false);
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : '구성원을 저장하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>구성원 편집</Button>
            </DialogTrigger>
            <DialogContent
                className="max-h-[90vh] max-w-2xl overflow-y-auto"
                showClose={!saving}
            >
                <DialogHeader>
                    <DialogTitle>{group.name} 구성원 편집</DialogTitle>
                    <DialogDescription>
                        사용자를 추가하거나 제거한 뒤 변경사항을 저장하세요.
                    </DialogDescription>
                </DialogHeader>
                <AssignmentPicker
                    options={options}
                    selectedIds={userIds}
                    initialIds={initialIds}
                    searchLabel="구성원 검색"
                    disabled={saving}
                    onChange={setUserIds}
                />
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={saving}
                        onClick={requestClose}
                    >
                        취소
                    </Button>
                    <Button type="button" disabled={saving} onClick={save}>
                        {saving ? '저장 중…' : '변경사항 저장'}
                    </Button>
                </DialogFooter>
            </DialogContent>

            <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            저장하지 않은 변경사항을 버릴까요?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            추가하거나 제거한 구성원이 저장되지 않습니다.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>계속 편집</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setDiscardOpen(false);
                                setOpen(false);
                            }}
                        >
                            변경사항 버리기
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
};

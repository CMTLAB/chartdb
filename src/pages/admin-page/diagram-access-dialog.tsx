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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/tabs/tabs';
import { apiFetch } from '@/lib/api';

import { AssignmentPicker, type AssignmentOption } from './assignment-picker';
import type { AdminDiagram, AdminGroup, AdminUser } from './admin-types';

type AccessTab = 'publishers' | 'groups' | 'users';

interface DiagramAccessDialogProps {
    diagram: AdminDiagram;
    users: AdminUser[];
    groups: AdminGroup[];
    onSaved: (diagram: AdminDiagram) => void;
}

const sameIds = (left: Set<string>, right: Set<string>) =>
    left.size === right.size && [...left].every((id) => right.has(id));

const userOption = (user: AdminUser, disabled: boolean): AssignmentOption => ({
    id: user.id,
    primary: user.displayName,
    secondary: [`@${user.username}`, user.department]
        .filter(Boolean)
        .join(' · '),
    badges: [user.role, ...(!user.active ? ['비활성'] : [])],
    disabled,
});

export const DiagramAccessDialog = ({
    diagram,
    users,
    groups,
    onSaved,
}: DiagramAccessDialogProps) => {
    const initialPublisherIds = useMemo(
        () => new Set(diagram.publisherIds),
        [diagram.publisherIds]
    );
    const initialUserGrantIds = useMemo(
        () => new Set(diagram.userGrantIds),
        [diagram.userGrantIds]
    );
    const initialGroupGrantIds = useMemo(
        () => new Set(diagram.groupGrantIds),
        [diagram.groupGrantIds]
    );
    const [open, setOpen] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const [tab, setTab] = useState<AccessTab>('publishers');
    const [publisherIds, setPublisherIds] = useState(initialPublisherIds);
    const [userGrantIds, setUserGrantIds] = useState(initialUserGrantIds);
    const [groupGrantIds, setGroupGrantIds] = useState(initialGroupGrantIds);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const dirty =
        !sameIds(publisherIds, initialPublisherIds) ||
        !sameIds(userGrantIds, initialUserGrantIds) ||
        !sameIds(groupGrantIds, initialGroupGrantIds);

    const publisherOptions = useMemo(
        () =>
            users
                .filter(
                    (user) =>
                        user.role === 'PUBLISHER' ||
                        initialPublisherIds.has(user.id)
                )
                .map((user) =>
                    userOption(
                        user,
                        (!user.active || user.role !== 'PUBLISHER') &&
                            !initialPublisherIds.has(user.id)
                    )
                ),
        [initialPublisherIds, users]
    );
    const userOptions = useMemo(
        () =>
            users
                .filter(
                    (user) =>
                        user.role !== 'ADMIN' ||
                        initialUserGrantIds.has(user.id)
                )
                .map((user) =>
                    userOption(
                        user,
                        (!user.active || user.role === 'ADMIN') &&
                            !initialUserGrantIds.has(user.id)
                    )
                ),
        [initialUserGrantIds, users]
    );
    const groupOptions = useMemo(
        () =>
            groups.map((group) => ({
                id: group.id,
                primary: group.name,
                badges: [`${group.userIds.length}명`],
            })),
        [groups]
    );

    const reset = () => {
        setTab('publishers');
        setPublisherIds(new Set(diagram.publisherIds));
        setUserGrantIds(new Set(diagram.userGrantIds));
        setGroupGrantIds(new Set(diagram.groupGrantIds));
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
            const response = await apiFetch<{ diagram: AdminDiagram }>(
                `/api/admin/diagrams/${diagram.id}/access`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        publisherIds: [...publisherIds],
                        userGrantIds: [...userGrantIds],
                        groupGrantIds: [...groupGrantIds],
                    }),
                }
            );
            onSaved(response.diagram);
            setOpen(false);
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : '권한을 저장하지 못했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>권한 편집</Button>
            </DialogTrigger>
            <DialogContent
                className="max-h-[90vh] max-w-3xl overflow-y-auto"
                showClose={!saving}
            >
                <DialogHeader>
                    <DialogTitle>{diagram.name} 권한 편집</DialogTitle>
                    <DialogDescription>
                        대상을 추가하거나 제거한 뒤 변경사항을 저장하세요.
                    </DialogDescription>
                </DialogHeader>

                <Tabs
                    value={tab}
                    onValueChange={(value) => setTab(value as AccessTab)}
                >
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="publishers" disabled={saving}>
                            공동 게시자
                        </TabsTrigger>
                        <TabsTrigger value="groups" disabled={saving}>
                            그룹 열람
                        </TabsTrigger>
                        <TabsTrigger value="users" disabled={saving}>
                            직접 열람
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="publishers">
                        <AssignmentPicker
                            options={publisherOptions}
                            selectedIds={publisherIds}
                            initialIds={initialPublisherIds}
                            searchLabel="게시자 검색"
                            disabled={saving}
                            onChange={setPublisherIds}
                        />
                    </TabsContent>
                    <TabsContent value="groups">
                        <AssignmentPicker
                            options={groupOptions}
                            selectedIds={groupGrantIds}
                            initialIds={initialGroupGrantIds}
                            searchLabel="그룹 검색"
                            disabled={saving}
                            onChange={setGroupGrantIds}
                        />
                    </TabsContent>
                    <TabsContent value="users">
                        <AssignmentPicker
                            options={userOptions}
                            selectedIds={userGrantIds}
                            initialIds={initialUserGrantIds}
                            searchLabel="사용자 검색"
                            disabled={saving}
                            onChange={setUserGrantIds}
                        />
                    </TabsContent>
                </Tabs>

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
                            추가하거나 제거한 권한이 저장되지 않습니다.
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

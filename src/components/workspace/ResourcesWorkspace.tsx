import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { insertNotificationsWithTelegram } from "@/lib/telegram";
import { cn } from "@/lib/utils";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";

type OnboardingSection = Tables<"onboarding_sections">;
type OnboardingCard = Tables<"onboarding_cards">;
type OnboardingProgress = Tables<"onboarding_card_progress">;
type OnboardingQuestion = Tables<"onboarding_questions">;
type OnboardingAnswer = Tables<"onboarding_answers">;
type OnboardingDocument = Tables<"onboarding_documents">;
type ProfileRow = Tables<"profiles">;
type TeamMembership = Pick<Tables<"team_memberships">, "team_id" | "user_id" | "is_active">;

type QuestionType = "text" | "multiple_choice" | "checkbox";
type AnswerDraft = Record<string, string | string[]>;
type OnboardingAnswerStatus = "locked" | "open" | "submitted" | "approved" | "rejected";

type CardFormState = {
  id: string;
  section_id: string;
  icon: string;
  title: string;
  summary: string;
  content: string;
  image_url: string;
  link_url: string;
  sort_order: number;
  is_active: boolean;
};

type QuestionFormState = {
  id: string;
  section_id: string;
  question_text: string;
  question_type: QuestionType;
  optionsText: string;
  sort_order: number;
  is_active: boolean;
};

type DocumentFormState = {
  id: string;
  title: string;
  description: string;
  link_url: string;
  document_type: string;
  sort_order: number;
  is_active: boolean;
};

const SECTION_KEYS = ["intro", "training", "advanced"] as const;
const EMPTY_CARDS: OnboardingCard[] = [];
const EMPTY_QUESTIONS: OnboardingQuestion[] = [];
const EMPTY_DOCUMENTS: OnboardingDocument[] = [];
const EMPTY_PROGRESS: OnboardingProgress[] = [];
const EMPTY_ANSWERS: OnboardingAnswer[] = [];

const emptyCardForm: CardFormState = {
  id: "",
  section_id: "",
  icon: "🚀",
  title: "",
  summary: "",
  content: "",
  image_url: "",
  link_url: "",
  sort_order: 0,
  is_active: true,
};

const emptyQuestionForm: QuestionFormState = {
  id: "",
  section_id: "",
  question_text: "",
  question_type: "text",
  optionsText: "",
  sort_order: 0,
  is_active: true,
};

const emptyDocumentForm: DocumentFormState = {
  id: "",
  title: "",
  description: "",
  link_url: "",
  document_type: "Tài liệu",
  sort_order: 0,
  is_active: true,
};

export function ResourcesWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";
  const isEmployee = role === "employee";
  const canViewProgress = role === "admin" || role === "manager" || role === "leader";

  const [selectedCard, setSelectedCard] = useState<OnboardingCard | null>(null);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [quizSection, setQuizSection] = useState<OnboardingSection | null>(null);
  const [cardForm, setCardForm] = useState<CardFormState>(emptyCardForm);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(emptyQuestionForm);
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(emptyDocumentForm);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, AnswerDraft>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [progressSearch, setProgressSearch] = useState("");
  const [progressStatus, setProgressStatus] = useState("all");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["onboarding-workspace", role, profile?.id],
    enabled: !!profile?.id && !!role,
    queryFn: async () => {
      let sectionsQuery = supabase
        .from("onboarding_sections")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      let cardsQuery = supabase
        .from("onboarding_cards")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      let questionsQuery = supabase
        .from("onboarding_questions")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      let documentsQuery = supabase
        .from("onboarding_documents")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (!isAdmin) {
        sectionsQuery = sectionsQuery.eq("is_active", true);
        cardsQuery = cardsQuery.eq("is_active", true);
        questionsQuery = questionsQuery.eq("is_active", true);
        documentsQuery = documentsQuery.eq("is_active", true);
      }

      const [
        sectionsResult,
        cardsResult,
        questionsResult,
        documentsResult,
        progressResult,
        answersResult,
        allProgressResult,
        allAnswersResult,
        profilesResult,
        rolesResult,
        membershipsResult,
      ] = await Promise.all([
        sectionsQuery,
        cardsQuery,
        questionsQuery,
        documentsQuery,
        supabase.from("onboarding_card_progress").select("*").eq("profile_id", profile!.id),
        supabase.from("onboarding_answers").select("*").eq("profile_id", profile!.id),
        canViewProgress
          ? supabase.from("onboarding_card_progress").select("*")
          : Promise.resolve({ data: [], error: null }),
        canViewProgress
          ? supabase.from("onboarding_answers").select("*")
          : Promise.resolve({ data: [], error: null }),
        canViewProgress
          ? supabase
              .from("profiles")
              .select(
                "id, full_name, username, avatar_url, status, auth_user_id, email, phone, created_at, updated_at",
              )
              .eq("status", "active")
          : Promise.resolve({ data: [], error: null }),
        canViewProgress
          ? supabase.from("user_roles").select("user_id, role").eq("role", "employee")
          : Promise.resolve({ data: [], error: null }),
        canViewProgress
          ? supabase
              .from("team_memberships")
              .select("team_id, user_id, is_active")
              .eq("is_active", true)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const firstError =
        sectionsResult.error ??
        cardsResult.error ??
        questionsResult.error ??
        documentsResult.error ??
        progressResult.error ??
        answersResult.error ??
        allProgressResult.error ??
        allAnswersResult.error ??
        profilesResult.error ??
        rolesResult.error ??
        membershipsResult.error;
      if (firstError) throw firstError;

      return {
        sections: (sectionsResult.data ?? []) as OnboardingSection[],
        cards: (cardsResult.data ?? []) as OnboardingCard[],
        questions: (questionsResult.data ?? []) as OnboardingQuestion[],
        documents: (documentsResult.data ?? []) as OnboardingDocument[],
        progress: (progressResult.data ?? []) as OnboardingProgress[],
        answers: (answersResult.data ?? []) as OnboardingAnswer[],
        allProgress: (allProgressResult.data ?? []) as OnboardingProgress[],
        allAnswers: (allAnswersResult.data ?? []) as OnboardingAnswer[],
        profiles: (profilesResult.data ?? []) as ProfileRow[],
        employeeRoleIds: new Set((rolesResult.data ?? []).map((row) => row.user_id)),
        memberships: (membershipsResult.data ?? []) as TeamMembership[],
      };
    },
  });

  const sections = useMemo(() => {
    const existing = data?.sections ?? [];
    return SECTION_KEYS.map((sectionKey, index) => {
      const found = existing.find((section) => section.section_key === sectionKey);
      if (found) return found;
      return {
        id: sectionKey,
        section_key: sectionKey,
        title: index === 0 ? "Giới thiệu" : index === 1 ? "Đào tạo" : "Nâng cao",
        description: null,
        sort_order: index + 1,
        is_active: true,
        created_by: null,
        updated_by: null,
        created_at: "",
        updated_at: "",
      } satisfies OnboardingSection;
    });
  }, [data?.sections]);

  const cards = data?.cards ?? EMPTY_CARDS;
  const questions = data?.questions ?? EMPTY_QUESTIONS;
  const documents = data?.documents ?? EMPTY_DOCUMENTS;
  const progress = data?.progress ?? EMPTY_PROGRESS;
  const answers = data?.answers ?? EMPTY_ANSWERS;

  const progressByCard = useMemo(
    () => new Map(progress.map((item) => [item.card_id, item])),
    [progress],
  );
  const answerBySection = useMemo(
    () => new Map(answers.map((item) => [item.section_id, item])),
    [answers],
  );
  const profileById = useMemo(
    () => new Map((data?.profiles ?? []).map((item) => [item.id, item])),
    [data?.profiles],
  );

  const cardsBySection = useMemo(() => groupBy(cards, "section_id"), [cards]);
  const questionsBySection = useMemo(() => groupBy(questions, "section_id"), [questions]);
  const learningCardsBySection = useMemo(() => {
    const map = new Map<string, OnboardingCard[]>();
    sections.forEach((section) => {
      map.set(section.id, (cardsBySection.get(section.id) ?? []).slice(0, 4));
    });
    return map;
  }, [cardsBySection, sections]);
  const learningCards = useMemo(
    () => sections.flatMap((section) => learningCardsBySection.get(section.id) ?? []),
    [learningCardsBySection, sections],
  );
  const totalCards = learningCards.length;
  const completedCards = learningCards.filter(
    (card) => progressByCard.get(card.id)?.completed_at,
  ).length;
  const progressPercent = totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0;
  const certificateReady =
    totalCards > 0 &&
    completedCards === totalCards &&
    sections.every((section) => {
      const sectionQuestions = questionsBySection.get(section.id) ?? [];
      return (
        sectionQuestions.length === 0 ||
        isSectionQuizApproved(section, answerBySection.get(section.id))
      );
    });

  const visibility = useMemo(() => {
    const sectionUnlocked = new Map<string, boolean>();
    const cardUnlocked = new Map<string, boolean>();

    sections.forEach((section, sectionIndex) => {
      if (!isEmployee) {
        sectionUnlocked.set(section.id, true);
        return;
      }

      if (sectionIndex === 0) {
        sectionUnlocked.set(section.id, true);
        return;
      }

      const previous = sections[sectionIndex - 1];
      const previousCards = learningCardsBySection.get(previous.id) ?? [];
      const previousQuestions = questionsBySection.get(previous.id) ?? [];
      const previousCardsDone = previousCards.every(
        (card) => progressByCard.get(card.id)?.completed_at,
      );
      const previousQuizDone =
        previousQuestions.length === 0 ||
        isSectionQuizApproved(previous, answerBySection.get(previous.id));
      sectionUnlocked.set(
        section.id,
        sectionUnlocked.get(previous.id) === true && previousCardsDone && previousQuizDone,
      );
    });

    sections.forEach((section) => {
      const sectionCards = learningCardsBySection.get(section.id) ?? [];
      sectionCards.forEach((card, cardIndex) => {
        if (!isEmployee) {
          cardUnlocked.set(card.id, true);
          return;
        }
        const previousCardsDone = sectionCards
          .slice(0, cardIndex)
          .every((previousCard) => progressByCard.get(previousCard.id)?.completed_at);
        cardUnlocked.set(card.id, sectionUnlocked.get(section.id) === true && previousCardsDone);
      });
    });

    return { sectionUnlocked, cardUnlocked };
  }, [
    answerBySection,
    isEmployee,
    learningCardsBySection,
    progressByCard,
    questionsBySection,
    sections,
  ]);

  const progressRows = useMemo(() => {
    if (!canViewProgress || !data) return [];
    const activeCardIds = new Set(learningCards.map((card) => card.id));
    const sectionIds = new Set(sections.map((section) => section.id));
    const questionSections = sections.filter(
      (section) => (questionsBySection.get(section.id) ?? []).length > 0,
    );
    const progressByProfile = groupBy(data.allProgress, "profile_id");
    const answersByProfile = groupBy(data.allAnswers, "profile_id");

    return data.profiles
      .filter((item) => data.employeeRoleIds.has(item.id))
      .map((item) => {
        const userProgress = progressByProfile.get(item.id) ?? [];
        const userAnswers = answersByProfile.get(item.id) ?? [];
        const completed = userProgress.filter(
          (row) => row.completed_at && activeCardIds.has(row.card_id),
        ).length;
        const quizzesDone = questionSections.filter((section) => {
          const answer = userAnswers.find(
            (item) => item.section_id === section.id && sectionIds.has(item.section_id),
          );
          return isSectionQuizApproved(section, answer);
        }).length;
        const percent = totalCards > 0 ? Math.round((completed / totalCards) * 100) : 0;
        const complete =
          totalCards > 0 && completed === totalCards && quizzesDone === questionSections.length;
        return {
          id: item.id,
          name: item.full_name,
          username: item.username,
          completed,
          percent,
          status: completed === 0 ? "Chưa bắt đầu" : complete ? "Hoàn thành" : "Đang học",
          complete,
        };
      })
      .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  }, [canViewProgress, data, learningCards, questionsBySection, sections, totalCards]);

  const reviewRequests = useMemo(() => {
    if (!canViewProgress || !data) return [];
    const introSections = new Set(
      sections.filter(isSectionReviewRequired).map((section) => section.id),
    );
    const leaderTeamIds = new Set(
      data.memberships
        .filter((membership) => membership.user_id === profile?.id)
        .map((membership) => membership.team_id),
    );
    const scopedProfileIds =
      role === "leader"
        ? new Set(
            data.memberships
              .filter((membership) => leaderTeamIds.has(membership.team_id))
              .map((membership) => membership.user_id),
          )
        : null;

    return data.allAnswers
      .filter((answer) => {
        if (!introSections.has(answer.section_id)) return false;
        if (getAnswerStatus(answer) !== "submitted") return false;
        return !scopedProfileIds || scopedProfileIds.has(answer.profile_id);
      })
      .map((answer) => ({
        answer,
        section: sections.find((section) => section.id === answer.section_id),
        employee: profileById.get(answer.profile_id),
      }))
      .filter(
        (
          item,
        ): item is { answer: OnboardingAnswer; section: OnboardingSection; employee: ProfileRow } =>
          !!item.section && !!item.employee,
      )
      .sort(
        (a, b) =>
          new Date(b.answer.submitted_at ?? b.answer.completed_at).getTime() -
          new Date(a.answer.submitted_at ?? a.answer.completed_at).getTime(),
      );
  }, [canViewProgress, data, profile?.id, profileById, role, sections]);

  const visibleProgressRows = useMemo(() => {
    const search = progressSearch.trim().toLowerCase();
    return progressRows.filter((row) => {
      const matchesSearch =
        !search ||
        row.name.toLowerCase().includes(search) ||
        row.username.toLowerCase().includes(search);
      const matchesStatus = progressStatus === "all" || row.status === progressStatus;
      return matchesSearch && matchesStatus;
    });
  }, [progressRows, progressSearch, progressStatus]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["onboarding-workspace"] });

  const openCardForm = (sectionId: string, card?: OnboardingCard) => {
    setCardForm(
      card
        ? {
            id: card.id,
            section_id: card.section_id,
            icon: card.icon ?? "🚀",
            title: card.title,
            summary: card.summary ?? "",
            content: card.content ?? "",
            image_url: card.image_url ?? "",
            link_url: card.link_url ?? "",
            sort_order: card.sort_order ?? 0,
            is_active: card.is_active,
          }
        : { ...emptyCardForm, section_id: sectionId },
    );
    setCardDialogOpen(true);
  };

  const openQuestionForm = (sectionId: string, question?: OnboardingQuestion) => {
    setQuestionForm(
      question
        ? {
            id: question.id,
            section_id: question.section_id,
            question_text: question.question_text,
            question_type: question.question_type as QuestionType,
            optionsText: getQuestionOptions(question).join("\n"),
            sort_order: question.sort_order ?? 0,
            is_active: question.is_active,
          }
        : { ...emptyQuestionForm, section_id: sectionId },
    );
    setQuestionDialogOpen(true);
  };

  const openDocumentForm = (document?: OnboardingDocument) => {
    setDocumentForm(
      document
        ? {
            id: document.id,
            title: document.title,
            description: document.description ?? "",
            link_url: document.link_url ?? "",
            document_type: document.document_type ?? "Tài liệu",
            sort_order: document.sort_order ?? 0,
            is_active: document.is_active,
          }
        : emptyDocumentForm,
    );
    setDocumentDialogOpen(true);
  };

  const saveCard = async () => {
    if (!cardForm.title.trim() || !cardForm.section_id) {
      toast.error("Nhập tiêu đề và chọn section");
      return;
    }
    const payload: TablesUpdate<"onboarding_cards"> = {
      section_id: cardForm.section_id,
      icon: cardForm.icon.trim() || null,
      title: cardForm.title.trim(),
      summary: cardForm.summary.trim() || null,
      content: cardForm.content.trim() || null,
      image_url: cardForm.image_url.trim() || null,
      link_url: cardForm.link_url.trim() || null,
      sort_order: Number(cardForm.sort_order) || 0,
      is_active: cardForm.is_active,
      updated_by: profile?.id,
    };

    const result = cardForm.id
      ? await supabase.from("onboarding_cards").update(payload).eq("id", cardForm.id)
      : await supabase.from("onboarding_cards").insert({
          ...payload,
          created_by: profile?.id,
        } as TablesInsert<"onboarding_cards">);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Đã lưu thẻ onboarding");
    setCardDialogOpen(false);
    invalidate();
  };

  const deleteCard = async (id: string) => {
    const { error } = await supabase.from("onboarding_cards").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa thẻ onboarding");
    invalidate();
  };

  const saveQuestion = async () => {
    if (!questionForm.question_text.trim() || !questionForm.section_id) {
      toast.error("Nhập nội dung câu hỏi");
      return;
    }
    const options = questionForm.optionsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (questionForm.question_type !== "text" && options.length === 0) {
      toast.error("Nhập ít nhất một lựa chọn");
      return;
    }

    const payload: TablesUpdate<"onboarding_questions"> = {
      section_id: questionForm.section_id,
      question_text: questionForm.question_text.trim(),
      question_type: questionForm.question_type,
      options,
      sort_order: Number(questionForm.sort_order) || 0,
      is_active: questionForm.is_active,
      updated_by: profile?.id,
    };

    const result = questionForm.id
      ? await supabase.from("onboarding_questions").update(payload).eq("id", questionForm.id)
      : await supabase.from("onboarding_questions").insert({
          ...payload,
          created_by: profile?.id,
        } as TablesInsert<"onboarding_questions">);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Đã lưu câu hỏi");
    setQuestionDialogOpen(false);
    invalidate();
  };

  const deleteQuestion = async (id: string) => {
    const { error } = await supabase.from("onboarding_questions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa câu hỏi");
    invalidate();
  };

  const saveDocument = async () => {
    if (!documentForm.title.trim()) {
      toast.error("Nhập tiêu đề tài liệu");
      return;
    }
    const payload: TablesUpdate<"onboarding_documents"> = {
      title: documentForm.title.trim(),
      description: documentForm.description.trim() || null,
      link_url: documentForm.link_url.trim() || null,
      document_type: documentForm.document_type.trim() || null,
      sort_order: Number(documentForm.sort_order) || 0,
      is_active: documentForm.is_active,
      updated_by: profile?.id,
    };

    const result = documentForm.id
      ? await supabase.from("onboarding_documents").update(payload).eq("id", documentForm.id)
      : await supabase.from("onboarding_documents").insert({
          ...payload,
          created_by: profile?.id,
        } as TablesInsert<"onboarding_documents">);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Đã lưu tài liệu");
    setDocumentDialogOpen(false);
    invalidate();
  };

  const deleteDocument = async (id: string) => {
    const { error } = await supabase.from("onboarding_documents").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã xóa tài liệu");
    invalidate();
  };

  const completeCard = async (card: OnboardingCard) => {
    if (!profile?.id) return;
    const { error } = await supabase.from("onboarding_card_progress").upsert(
      {
        profile_id: profile.id,
        card_id: card.id,
        accepted_commitment: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,card_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Đã ghi nhận cam kết");
    setSelectedCard(null);
    invalidate();
  };

  const notifyOnboardingReviewRequest = async (
    answer: OnboardingAnswer,
    section: OnboardingSection,
  ) => {
    if (!profile?.id || !data) return;
    const teamIds = data.memberships
      .filter((membership) => membership.user_id === profile.id)
      .map((membership) => membership.team_id);
    if (!teamIds.length) return;

    const { data: teamMembers, error: membershipError } = await supabase
      .from("team_memberships")
      .select("user_id")
      .in("team_id", teamIds)
      .eq("is_active", true);
    if (membershipError) {
      console.debug("[MKTRe onboarding notification]", membershipError.message);
      return;
    }

    const candidateIds = [...new Set((teamMembers ?? []).map((item) => item.user_id))].filter(
      (id) => id !== profile.id,
    );
    if (!candidateIds.length) return;

    const { data: leaderRoles, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("user_id", candidateIds)
      .eq("role", "leader");
    if (roleError) {
      console.debug("[MKTRe onboarding notification]", roleError.message);
      return;
    }

    const leaderIds = [...new Set((leaderRoles ?? []).map((item) => item.user_id))];
    if (!leaderIds.length) return;

    const notifications: TablesInsert<"notifications">[] = leaderIds.map((leaderId) => ({
      target_profile_id: leaderId,
      user_id: leaderId,
      actor_profile_id: profile.id,
      created_by: profile.id,
      scope: "team",
      target_scope: "team",
      type: "onboarding_review",
      kind: "onboarding_review",
      entity_type: "onboarding_answer",
      entity_id: answer.id,
      title: "Duyệt onboarding",
      message: `${profile.full_name} đã gửi duyệt section ${section.title}.`,
      body: `${profile.full_name} đã gửi duyệt section ${section.title}.`,
      severity: "warning",
      is_read: false,
      metadata: {
        section_id: section.id,
        section_title: section.title,
        answer_id: answer.id,
      } as Json,
    }));

    const { error } = await insertNotificationsWithTelegram(notifications);
    if (error) {
      console.debug("[MKTRe onboarding notification]", error.message);
    }
  };

  const notifyOnboardingReviewResult = async (
    answer: OnboardingAnswer,
    section: OnboardingSection,
    approved: boolean,
    note: string,
  ) => {
    if (!profile?.id) return;
    const title = approved ? "Onboarding đã được duyệt" : "Cần làm lại onboarding";
    const message = approved
      ? `Section ${section.title} đã được duyệt. Bạn có thể học section tiếp theo.`
      : `Section ${section.title} cần làm lại.${note ? ` Ghi chú: ${note}` : ""}`;
    const { error } = await insertNotificationsWithTelegram({
      target_profile_id: answer.profile_id,
      user_id: answer.profile_id,
      actor_profile_id: profile.id,
      created_by: profile.id,
      scope: "personal",
      target_scope: "personal",
      type: approved ? "onboarding_approved" : "onboarding_rejected",
      kind: approved ? "onboarding_approved" : "onboarding_rejected",
      entity_type: "onboarding_answer",
      entity_id: answer.id,
      title,
      message,
      body: message,
      severity: approved ? "success" : "error",
      is_read: false,
      metadata: {
        section_id: section.id,
        section_title: section.title,
        answer_id: answer.id,
        review_note: note || null,
      } as Json,
    } satisfies TablesInsert<"notifications">);
    if (error) {
      console.debug("[MKTRe onboarding notification]", error.message);
    }
  };

  const submitSectionAnswers = async (section: OnboardingSection) => {
    if (!profile?.id) return false;
    const sectionQuestions = questionsBySection.get(section.id) ?? [];
    const draft = answerDrafts[section.id] ?? {};
    const missing = sectionQuestions.some((question) => {
      const value = draft[question.id];
      return Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
    });
    if (missing) {
      toast.warning("Bạn còn câu hỏi chưa trả lời. Kiểm tra lại rồi nộp lại nhé.");
      return false;
    }

    const now = new Date().toISOString();
    const requiresReview = isEmployee && isSectionReviewRequired(section);
    const { data: savedAnswer, error } = await supabase
      .from("onboarding_answers")
      .upsert(
        {
          profile_id: profile.id,
          section_id: section.id,
          answers: draft as Json,
          completed_at: now,
          submitted_at: now,
          status: requiresReview ? "submitted" : "approved",
          reviewed_by: null,
          reviewed_at: null,
          review_note: null,
        },
        { onConflict: "profile_id,section_id" },
      )
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return false;
    }
    if (requiresReview && savedAnswer) {
      await notifyOnboardingReviewRequest(savedAnswer as OnboardingAnswer, section);
      toast.success("Đã gửi Leader duyệt. Section tiếp theo sẽ mở sau khi được duyệt.");
    } else {
      toast.success("Đã hoàn thành câu hỏi section");
    }
    setQuizSection(null);
    invalidate();
    return true;
  };

  const reviewOnboardingAnswer = async (
    answer: OnboardingAnswer,
    section: OnboardingSection,
    approved: boolean,
  ) => {
    if (!profile?.id) return;
    const note = (reviewNotes[answer.id] ?? "").trim();
    if (!approved && !note) {
      toast.warning("Nhập ghi chú để nhân sự biết cần làm lại phần nào.");
      return;
    }

    const { error } = await supabase
      .from("onboarding_answers")
      .update({
        status: approved ? "approved" : "rejected",
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      } satisfies TablesUpdate<"onboarding_answers">)
      .eq("id", answer.id);
    if (error) {
      toast.error(error.message);
      return;
    }

    await notifyOnboardingReviewResult(answer, section, approved, note);
    setReviewNotes((current) => {
      const next = { ...current };
      delete next[answer.id];
      return next;
    });
    toast.success(approved ? "Đã duyệt section onboarding" : "Đã yêu cầu làm lại section");
    invalidate();
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="rounded-3xl border bg-card px-8 py-7 text-center shadow-sm">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <div className="mt-3 text-sm font-semibold">Đang tải hướng dẫn tân thủ...</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Đang đồng bộ lộ trình và tiến độ.
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="max-w-md rounded-3xl border bg-card p-7 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <X className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-bold">Không tải được onboarding</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Có lỗi khi tải dữ liệu hướng dẫn tân thủ."}
          </p>
          <Button className="mt-5 rounded-full" onClick={() => refetch()}>
            Tải lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-4 overflow-hidden">
      <WorkspacePageHeader
        icon={<GraduationCap className="h-5 w-5" />}
        title="Hướng dẫn tân thủ"
        subtitle="Lộ trình onboarding, đào tạo và văn bản cần đọc cho nhân sự mới."
        badge={
          <Badge
            className={cn(
              "rounded-full px-4 py-2 text-sm shadow-sm",
              certificateReady
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                : "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
            )}
          >
            {certificateReady ? (
              <>
                <Award className="mr-1.5 h-4 w-4" /> Đã được chứng nhận
              </>
            ) : (
              `${completedCards}/${totalCards}`
            )}
          </Badge>
        }
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" onClick={() => openDocumentForm()}>
                <Plus className="mr-2 h-4 w-4" /> Tài liệu
              </Button>
            )}
          </>
        }
        className="overflow-hidden backdrop-blur supports-[backdrop-filter]:bg-background/85"
      >
        <div className="h-1.5 bg-muted">
          <div
            className={cn(
              "h-full transition-all",
              certificateReady ? "bg-emerald-500" : "bg-indigo-500",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </WorkspacePageHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {sections.map((section, index) => {
          const sectionCards = learningCardsBySection.get(section.id) ?? [];
          const sectionQuestions = questionsBySection.get(section.id) ?? [];
          const sectionAnswer = answerBySection.get(section.id);
          const answerStatus = getAnswerStatus(sectionAnswer);
          const needsReview = isEmployee && isSectionReviewRequired(section);
          const unlocked = visibility.sectionUnlocked.get(section.id) === true;
          const sectionCompletedCount = sectionCards.filter(
            (card) => progressByCard.get(card.id)?.completed_at,
          ).length;
          const sectionCardsComplete =
            sectionCards.length > 0 && sectionCompletedCount === sectionCards.length;
          const quizDone =
            sectionQuestions.length === 0 || isSectionQuizApproved(section, sectionAnswer);
          const sectionComplete = sectionCardsComplete && quizDone;
          const sectionPercent =
            sectionCards.length > 0
              ? Math.round((sectionCompletedCount / sectionCards.length) * 100)
              : 0;
          return (
            <section
              key={section.id}
              className={cn(
                "overflow-hidden rounded-3xl border bg-card shadow-sm",
                isEmployee && !unlocked && "bg-muted/30",
              )}
            >
              <div className="border-b bg-gradient-to-br from-background via-background to-muted/35 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
                        <SectionIcon index={index} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">{section.title}</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {section.description ?? "Click vào từng thẻ để xem chi tiết"}
                        </p>
                      </div>
                      <SectionStatusBadge
                        locked={isEmployee && !unlocked}
                        complete={sectionComplete}
                        unlocked={unlocked}
                        answerStatus={needsReview ? answerStatus : undefined}
                      />
                    </div>
                    <div className="mt-4 flex max-w-xl items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            sectionComplete ? "bg-emerald-500" : "bg-indigo-500",
                          )}
                          style={{ width: `${sectionPercent}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {sectionCompletedCount}/{sectionCards.length || 0}
                      </span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openQuestionForm(section.id)}
                      >
                        <Plus className="mr-2 h-4 w-4" /> Câu hỏi
                      </Button>
                      <Button size="sm" onClick={() => openCardForm(section.id)}>
                        <Plus className="mr-2 h-4 w-4" /> Thêm thẻ
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5">
                {sectionCards.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {sectionCards.map((card, cardIndex) => {
                      const completed = !!progressByCard.get(card.id)?.completed_at;
                      const cardUnlocked = visibility.cardUnlocked.get(card.id) === true;
                      return (
                        <OnboardingCardItem
                          key={card.id}
                          card={card}
                          step={cardIndex + 1}
                          locked={isEmployee && !cardUnlocked}
                          completed={completed}
                          canEdit={isAdmin}
                          onOpen={() => {
                            if (isEmployee && !cardUnlocked) {
                              toast.warning("Bạn cần hoàn thành thẻ trước đó");
                              return;
                            }
                            setSelectedCard(card);
                          }}
                          onEdit={() => openCardForm(section.id, card)}
                          onDelete={() => deleteCard(card.id)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState text="Chưa có thẻ giới thiệu." />
                )}

                {isEmployee &&
                  unlocked &&
                  sectionQuestions.length > 0 &&
                  sectionCardsComplete &&
                  (!sectionAnswer || answerStatus === "rejected") && (
                    <QuizCta
                      section={section}
                      reviewRequired={needsReview}
                      rejectedNote={answerStatus === "rejected" ? sectionAnswer?.review_note : null}
                      onClick={() => setQuizSection(section)}
                    />
                  )}

                {isEmployee && needsReview && answerStatus === "submitted" && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck className="h-4 w-4" />
                      Chờ Leader duyệt
                    </div>
                    <p className="mt-1 text-amber-800/80">
                      Bạn đã gửi câu trả lời section này. Section tiếp theo sẽ mở sau khi Leader
                      duyệt.
                    </p>
                  </div>
                )}

                {isEmployee && needsReview && answerStatus === "approved" && (
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      Đã duyệt
                    </div>
                    <p className="mt-1 text-emerald-800/80">
                      Section này đã được duyệt. Bạn có thể tiếp tục phần tiếp theo.
                    </p>
                  </div>
                )}

                {!isEmployee && (
                  <SectionQuiz
                    questions={sectionQuestions}
                    answered={answerBySection.has(section.id)}
                    isAdmin={isAdmin}
                    onEditQuestion={(question) => openQuestionForm(section.id, question)}
                    onDeleteQuestion={(questionId) => deleteQuestion(questionId)}
                  />
                )}
              </div>
            </section>
          );
        })}

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-bold">Văn bản & Tài liệu</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Văn bản công bố, quy định, cơ chế và link tham khảo.
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => openDocumentForm()}>
                <Plus className="mr-2 h-4 w-4" /> Thêm tài liệu
              </Button>
            )}
          </div>

          {documents.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {documents.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  canEdit={isAdmin}
                  onEdit={() => openDocumentForm(document)}
                  onDelete={() => deleteDocument(document.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState text="Chưa có tài nguyên." />
          )}
        </section>

        {canViewProgress && (
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-600" />
                  <h2 className="text-xl font-bold">Duyệt onboarding</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Duyệt Section 1 trước khi nhân sự được mở khóa phần Đào tạo.
                </p>
              </div>
              <Badge variant="secondary" className="rounded-full">
                {reviewRequests.length} yêu cầu
              </Badge>
            </div>
            {reviewRequests.length ? (
              <div className="mt-4 grid gap-3">
                {reviewRequests.map(({ answer, section, employee }) => (
                  <div key={answer.id} className="rounded-2xl border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{employee.full_name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          @{employee.username} · {section.title} · Gửi lúc{" "}
                          {formatDateTime(answer.submitted_at ?? answer.completed_at)}
                        </div>
                      </div>
                      <Badge className="rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100">
                        Chờ duyệt
                      </Badge>
                    </div>
                    <AnswerPreview
                      questions={questionsBySection.get(section.id) ?? []}
                      answer={answer}
                    />
                    <Textarea
                      className="mt-3 min-h-20"
                      value={reviewNotes[answer.id] ?? ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [answer.id]: event.target.value,
                        }))
                      }
                      placeholder="Ghi chú duyệt hoặc lý do yêu cầu làm lại..."
                    />
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        className="rounded-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => reviewOnboardingAnswer(answer, section, false)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Yêu cầu làm lại
                      </Button>
                      <Button
                        className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => reviewOnboardingAnswer(answer, section, true)}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Duyệt section
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="Chưa có yêu cầu duyệt onboarding." />
            )}
          </section>
        )}

        {canViewProgress && (
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Tiến độ onboarding</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Theo dõi số thẻ đã hoàn thành và trạng thái chứng chỉ của nhân sự.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Input
                  className="h-10 sm:w-64"
                  value={progressSearch}
                  onChange={(event) => setProgressSearch(event.target.value)}
                  placeholder="Tìm nhân sự..."
                />
                <Select value={progressStatus} onValueChange={setProgressStatus}>
                  <SelectTrigger className="h-10 sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="Chưa bắt đầu">Chưa bắt đầu</SelectItem>
                    <SelectItem value="Đang học">Đang học</SelectItem>
                    <SelectItem value="Hoàn thành">Hoàn thành</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {visibleProgressRows.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border">
                <div className="hidden grid-cols-[1fr_120px_160px_140px] bg-muted/60 px-4 py-3 text-sm font-semibold text-muted-foreground md:grid">
                  <span>Nhân sự</span>
                  <span>Tiến độ</span>
                  <span>% hoàn thành</span>
                  <span>Trạng thái</span>
                </div>
                <div className="divide-y">
                  {visibleProgressRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_120px_160px_140px] md:items-center"
                    >
                      <div>
                        <div className="font-semibold">{row.name}</div>
                        <div className="text-xs text-muted-foreground">@{row.username}</div>
                      </div>
                      <span className="font-semibold">
                        {row.completed}/{totalCards}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              row.complete ? "bg-emerald-500" : "bg-indigo-500",
                            )}
                            style={{ width: `${row.percent}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-medium">{row.percent}%</span>
                      </div>
                      <Badge
                        className={cn(
                          "w-fit rounded-full",
                          row.complete
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : row.completed === 0
                              ? "bg-slate-100 text-slate-700 hover:bg-slate-100"
                              : "bg-amber-100 text-amber-700 hover:bg-amber-100",
                        )}
                      >
                        {row.complete && <Award className="mr-1 h-3 w-3" />}
                        {row.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState text="Chưa có dữ liệu tiến độ." />
            )}
          </section>
        )}
      </div>

      <CardDetailDialog
        card={selectedCard}
        completed={!!selectedCard && !!progressByCard.get(selectedCard.id)?.completed_at}
        employeeMode={isEmployee}
        onComplete={completeCard}
        onOpenChange={(open) => !open && setSelectedCard(null)}
      />
      <QuizModal
        section={quizSection}
        questions={quizSection ? (questionsBySection.get(quizSection.id) ?? []) : []}
        draft={quizSection ? (answerDrafts[quizSection.id] ?? {}) : {}}
        onDraftChange={(nextDraft) => {
          if (!quizSection) return;
          setAnswerDrafts((current) => ({ ...current, [quizSection.id]: nextDraft }));
        }}
        onSubmit={() => (quizSection ? submitSectionAnswers(quizSection) : Promise.resolve(false))}
        onOpenChange={(open) => !open && setQuizSection(null)}
        submitLabel={
          quizSection && isEmployee && isSectionReviewRequired(quizSection)
            ? "Gửi Leader duyệt"
            : "Nộp câu trả lời"
        }
      />
      <CardFormDialog
        open={cardDialogOpen}
        onOpenChange={setCardDialogOpen}
        form={cardForm}
        sections={sections}
        setForm={setCardForm}
        onSave={saveCard}
      />
      <QuestionFormDialog
        open={questionDialogOpen}
        onOpenChange={setQuestionDialogOpen}
        form={questionForm}
        sections={sections}
        setForm={setQuestionForm}
        onSave={saveQuestion}
      />
      <DocumentFormDialog
        open={documentDialogOpen}
        onOpenChange={setDocumentDialogOpen}
        form={documentForm}
        setForm={setDocumentForm}
        onSave={saveDocument}
      />
    </div>
  );
}

function OnboardingCardItem({
  card,
  step,
  locked,
  completed,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
}: {
  card: OnboardingCard;
  step: number;
  locked: boolean;
  completed: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className={cn(
        "group relative flex min-h-52 flex-col overflow-hidden rounded-3xl border bg-background p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        locked && "bg-muted/40 opacity-70 hover:translate-y-0 hover:border-border hover:shadow-sm",
        completed && "border-emerald-200 bg-emerald-50/40",
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1",
          completed ? "bg-emerald-500" : locked ? "bg-muted" : "bg-indigo-500",
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-sm",
              completed
                ? "bg-emerald-100 text-emerald-700"
                : locked
                  ? "bg-muted text-muted-foreground"
                  : "bg-indigo-100 text-indigo-700",
            )}
          >
            {locked ? <Lock className="h-5 w-5" /> : (card.icon ?? "🚀")}
          </div>
          <Badge variant="secondary" className="rounded-full">
            Bước {step}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {completed && (
            <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Xong
            </Badge>
          )}
          {canEdit && (
            <>
              {!card.is_active && <Badge variant="secondary">Ẩn</Badge>}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-1 flex-col">
        <h3 className="line-clamp-2 text-lg font-bold tracking-tight">{card.title}</h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {card.summary ?? card.content ?? "Click để xem chi tiết."}
        </p>
        <div
          className={cn(
            "mt-auto flex items-center gap-2 pt-5 text-sm font-semibold",
            locked ? "text-muted-foreground" : completed ? "text-emerald-700" : "text-primary",
          )}
        >
          {locked ? "Đang khóa" : completed ? "Đã đọc" : "Xem chi tiết"}
          {!locked && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />}
        </div>
      </div>
    </div>
  );
}

function CardDetailDialog({
  card,
  completed,
  employeeMode,
  onComplete,
  onOpenChange,
}: {
  card: OnboardingCard | null;
  completed: boolean;
  employeeMode: boolean;
  onComplete: (card: OnboardingCard) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setReachedEnd(false);
    setAccepted(false);
    window.requestAnimationFrame(() => {
      const node = contentRef.current;
      if (node && node.scrollHeight <= node.clientHeight + 4) setReachedEnd(true);
    });
  }, [card?.id]);

  const checkScrollEnd = () => {
    const node = contentRef.current;
    if (!node) return;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 8) {
      setReachedEnd(true);
    }
  };

  return (
    <Dialog open={!!card} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl p-0 [&>button]:rounded-full">
        {card && (
          <>
            <DialogHeader className="shrink-0 border-b bg-background/95 px-6 py-5 pr-14 text-left">
              <DialogTitle className="flex items-center gap-3 text-xl font-bold md:text-2xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                  {card.icon ?? "🚀"}
                </span>
                {card.title}
              </DialogTitle>
            </DialogHeader>
            <div
              ref={contentRef}
              onScroll={checkScrollEnd}
              className="min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-width:thin]"
            >
              {card.image_url && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={card.image_url}
                    alt={card.title}
                    className="aspect-square w-full max-w-sm rounded-2xl border object-cover shadow-sm"
                  />
                </div>
              )}
              {card.summary && (
                <p className="mb-5 text-base font-medium leading-8 text-foreground">
                  {card.summary}
                </p>
              )}
              <div className="whitespace-pre-line rounded-2xl bg-muted/25 p-5 text-sm leading-8 text-muted-foreground">
                {card.content ?? "Chưa có nội dung chi tiết."}
              </div>
            </div>
            <DialogFooter className="shrink-0 border-t bg-background/95 px-6 py-4">
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {employeeMode && !completed && (
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={accepted}
                          disabled={!reachedEnd}
                          onCheckedChange={(value) => setAccepted(!!value)}
                        />
                        Tôi cam kết đã hiểu
                      </label>
                      {!reachedEnd && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cuộn đến cuối nội dung để xác nhận.
                        </p>
                      )}
                    </div>
                  )}
                  {employeeMode && completed && (
                    <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      Đã hoàn thành
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {card.link_url && (
                    <Button variant="outline" asChild>
                      <a href={card.link_url} target="_blank" rel="noreferrer">
                        Mở liên kết <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {employeeMode && !completed && (
                    <Button disabled={!reachedEnd || !accepted} onClick={() => onComplete(card)}>
                      Đồng ý
                    </Button>
                  )}
                </div>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuizCta({
  section,
  reviewRequired,
  rejectedNote,
  onClick,
}: {
  section: OnboardingSection;
  reviewRequired?: boolean;
  rejectedNote?: string | null;
  onClick: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-indigo-950">
              {rejectedNote ? "Section cần làm lại" : "Bạn đã hoàn thành nội dung section"}
            </h3>
            <p className="mt-1 text-sm text-indigo-700/80">
              {reviewRequired
                ? `Làm câu hỏi: ${section.title} rồi gửi Leader duyệt để mở khóa section tiếp theo.`
                : `Làm câu hỏi: ${section.title} để mở khóa section tiếp theo.`}
            </p>
            {rejectedNote && (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Ghi chú Leader: {rejectedNote}
              </p>
            )}
          </div>
        </div>
        <Button className="rounded-full" onClick={onClick}>
          {reviewRequired ? <Send className="mr-2 h-4 w-4" /> : null}
          {reviewRequired ? `Gửi Leader duyệt` : `Làm câu hỏi: ${section.title}`}
        </Button>
      </div>
    </div>
  );
}

function QuizModal({
  section,
  questions,
  draft,
  onDraftChange,
  onSubmit,
  onOpenChange,
  submitLabel = "Nộp câu trả lời",
}: {
  section: OnboardingSection | null;
  questions: OnboardingQuestion[];
  draft: AnswerDraft;
  onDraftChange: (draft: AnswerDraft) => void;
  onSubmit: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  submitLabel?: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const answeredCount = questions.filter((question) => {
    const value = draft[question.id];
    return Array.isArray(value) ? value.length > 0 : !!String(value ?? "").trim();
  }).length;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!section} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl p-0 [&>button]:rounded-full">
        {section && (
          <>
            <DialogHeader className="shrink-0 border-b bg-background/95 px-6 py-5 pr-14 text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">Câu hỏi: {section.title}</DialogTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Trả lời đầy đủ để mở khóa phần tiếp theo.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {answeredCount}/{questions.length}
                </span>
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 [scrollbar-width:thin]">
              {questions.length ? (
                questions.map((question, index) => (
                  <div key={question.id} className="rounded-2xl border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <Badge variant="secondary" className="rounded-full">
                        Câu {index + 1}/{questions.length}
                      </Badge>
                      <Badge className="rounded-full bg-background text-foreground hover:bg-background">
                        {question.question_type === "text"
                          ? "Tự luận"
                          : question.question_type === "multiple_choice"
                            ? "Một lựa chọn"
                            : "Nhiều lựa chọn"}
                      </Badge>
                    </div>
                    <QuestionAnswer
                      question={question}
                      value={draft[question.id]}
                      onChange={(value) => onDraftChange({ ...draft, [question.id]: value })}
                    />
                  </div>
                ))
              ) : (
                <EmptyState text="Section này chưa có câu hỏi." />
              )}
            </div>
            <DialogFooter className="shrink-0 border-t bg-background/95 px-6 py-4">
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Nếu chưa đạt, bạn có thể chỉnh lại câu trả lời và nộp lại.
                </p>
                <Button
                  className="rounded-full"
                  disabled={submitting || questions.length === 0}
                  onClick={handleSubmit}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitLabel}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionQuiz({
  questions,
  answered,
  isAdmin,
  onEditQuestion,
  onDeleteQuestion,
}: {
  questions: OnboardingQuestion[];
  answered: boolean;
  isAdmin: boolean;
  onEditQuestion: (question: OnboardingQuestion) => void;
  onDeleteQuestion: (questionId: string) => void;
}) {
  if (!questions.length) return null;

  return (
    <div className="mt-5 rounded-2xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <HelpCircle className="h-4 w-4 text-primary" />
            Câu hỏi cuối section
          </h3>
          <p className="text-sm text-muted-foreground">
            Employee cần hoàn thành phần này để mở section tiếp theo.
          </p>
        </div>
        {answered && (
          <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            Đã hoàn thành
          </Badge>
        )}
      </div>

      {isAdmin && (
        <div className="mt-3 space-y-2">
          {questions.map((question) => (
            <div
              key={question.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm"
            >
              <span className="line-clamp-1">{question.question_text}</span>
              <div className="flex gap-1">
                {!question.is_active && <Badge variant="secondary">Ẩn</Badge>}
                <Button variant="ghost" size="icon" onClick={() => onEditQuestion(question)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onDeleteQuestion(question.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isAdmin && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {questions.map((question) => (
            <div key={question.id} className="rounded-xl border bg-background px-3 py-2 text-sm">
              <div className="font-medium">{question.question_text}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {question.question_type === "text"
                  ? "Câu trả lời tự luận"
                  : getQuestionOptions(question).join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionAnswer({
  question,
  value,
  onChange,
}: {
  question: OnboardingQuestion;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const options = getQuestionOptions(question);
  if (question.question_type === "multiple_choice") {
    return (
      <Field label={question.question_text}>
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Chọn câu trả lời" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }
  if (question.question_type === "checkbox") {
    const values = Array.isArray(value) ? value : [];
    return (
      <Field label={question.question_text}>
        <div className="space-y-2 rounded-xl border bg-background p-3">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.includes(option)}
                onCheckedChange={(checked) => {
                  onChange(
                    checked ? [...values, option] : values.filter((item) => item !== option),
                  );
                }}
              />
              {option}
            </label>
          ))}
        </div>
      </Field>
    );
  }
  return (
    <Field label={question.question_text}>
      <Textarea
        className="min-h-24"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Nhập câu trả lời"
      />
    </Field>
  );
}

function DocumentCard({
  document,
  canEdit,
  onEdit,
  onDelete,
}: {
  document: OnboardingDocument;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-3xl border bg-background p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="rounded-full">
            {document.document_type ?? "Tài liệu"}
          </Badge>
          {canEdit && (
            <>
              {!document.is_active && <Badge variant="secondary">Ẩn</Badge>}
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      <h3 className="mt-5 line-clamp-2 text-lg font-bold">{document.title}</h3>
      <p className="mt-2 line-clamp-3 min-h-14 text-sm leading-6 text-muted-foreground">
        {document.description ?? "Chưa có mô tả."}
      </p>
      {document.link_url && (
        <Button variant="outline" className="mt-4 w-full rounded-full bg-background" asChild>
          <a href={document.link_url} target="_blank" rel="noreferrer">
            Mở <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      )}
    </div>
  );
}

function CardFormDialog({
  open,
  onOpenChange,
  form,
  sections,
  setForm,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CardFormState;
  sections: OnboardingSection[];
  setForm: (form: CardFormState) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Sửa thẻ onboarding" : "Thêm thẻ onboarding"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-[120px_1fr_150px]">
          <Field label="Icon/emoji">
            <Input
              value={form.icon}
              onChange={(event) => setForm({ ...form, icon: event.target.value })}
            />
          </Field>
          <Field label="Tiêu đề">
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </Field>
          <Field label="Section">
            <Select
              value={form.section_id}
              onValueChange={(value) => setForm({ ...form, section_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-3">
            <Label>Mô tả ngắn</Label>
            <Textarea
              className="mt-1 min-h-20"
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
            />
          </div>
          <Field label="Ảnh URL">
            <Input
              value={form.image_url}
              onChange={(event) => setForm({ ...form, image_url: event.target.value })}
            />
          </Field>
          <Field label="Link URL">
            <Input
              value={form.link_url}
              onChange={(event) => setForm({ ...form, link_url: event.target.value })}
            />
          </Field>
          <Field label="Thứ tự">
            <Input
              type="number"
              value={form.sort_order}
              onChange={(event) =>
                setForm({ ...form, sort_order: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={(value) => setForm({ ...form, is_active: !!value })}
            />
            Đang hiển thị
          </label>
          <div className="md:col-span-3">
            <Label>Nội dung chi tiết</Label>
            <Textarea
              className="mt-1 min-h-40"
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" /> Hủy
          </Button>
          <Button onClick={onSave}>
            <Save className="mr-2 h-4 w-4" /> Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionFormDialog({
  open,
  onOpenChange,
  form,
  sections,
  setForm,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: QuestionFormState;
  sections: OnboardingSection[];
  setForm: (form: QuestionFormState) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Sửa câu hỏi" : "Thêm câu hỏi"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Section">
            <Select
              value={form.section_id}
              onValueChange={(value) => setForm({ ...form, section_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Câu hỏi">
            <Textarea
              className="min-h-24"
              value={form.question_text}
              onChange={(event) => setForm({ ...form, question_text: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Loại câu hỏi">
              <Select
                value={form.question_type}
                onValueChange={(value) =>
                  setForm({ ...form, question_type: value as QuestionType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Thứ tự">
              <Input
                type="number"
                value={form.sort_order}
                onChange={(event) =>
                  setForm({ ...form, sort_order: Number(event.target.value) || 0 })
                }
              />
            </Field>
          </div>
          {form.question_type !== "text" && (
            <Field label="Lựa chọn, mỗi dòng một đáp án">
              <Textarea
                className="min-h-28"
                value={form.optionsText}
                onChange={(event) => setForm({ ...form, optionsText: event.target.value })}
              />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={(value) => setForm({ ...form, is_active: !!value })}
            />
            Đang hiển thị
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={onSave}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: DocumentFormState;
  setForm: (form: DocumentFormState) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Sửa tài liệu" : "Thêm tài liệu"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Tiêu đề">
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Loại tài liệu">
              <Input
                value={form.document_type}
                onChange={(event) => setForm({ ...form, document_type: event.target.value })}
              />
            </Field>
            <Field label="Thứ tự">
              <Input
                type="number"
                value={form.sort_order}
                onChange={(event) =>
                  setForm({ ...form, sort_order: Number(event.target.value) || 0 })
                }
              />
            </Field>
          </div>
          <Field label="Link URL">
            <Input
              value={form.link_url}
              onChange={(event) => setForm({ ...form, link_url: event.target.value })}
            />
          </Field>
          <Field label="Mô tả ngắn">
            <Textarea
              className="min-h-24"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={(value) => setForm({ ...form, is_active: !!value })}
            />
            Đang hiển thị
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={onSave}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionIcon({ index }: { index: number }) {
  const classes = "h-5 w-5";
  if (index === 0) return <BookOpenCheck className={cn(classes, "text-indigo-600")} />;
  if (index === 1) return <GraduationCap className={cn(classes, "text-emerald-600")} />;
  return <CheckCircle2 className={cn(classes, "text-violet-600")} />;
}

function AnswerPreview({
  questions,
  answer,
}: {
  questions: OnboardingQuestion[];
  answer: OnboardingAnswer;
}) {
  const answerRecord = isRecord(answer.answers) ? answer.answers : {};
  return (
    <div className="mt-3 rounded-2xl border bg-background p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Câu trả lời
      </div>
      <div className="space-y-2">
        {questions.length ? (
          questions.map((question, index) => (
            <div key={question.id} className="rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <div className="font-medium">
                {index + 1}. {question.question_text}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {formatAnswerValue(answerRecord[question.id])}
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">Section này chưa có câu hỏi.</div>
        )}
      </div>
    </div>
  );
}

function SectionStatusBadge({
  locked,
  complete,
  unlocked,
  answerStatus,
}: {
  locked: boolean;
  complete: boolean;
  unlocked: boolean;
  answerStatus?: OnboardingAnswerStatus;
}) {
  if (answerStatus === "submitted") {
    return (
      <Badge className="rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100">
        <ShieldCheck className="mr-1 h-3 w-3" /> Chờ duyệt
      </Badge>
    );
  }
  if (answerStatus === "rejected") {
    return (
      <Badge className="rounded-full bg-red-100 text-red-700 hover:bg-red-100">
        <RotateCcw className="mr-1 h-3 w-3" /> Cần làm lại
      </Badge>
    );
  }
  if (answerStatus === "approved") {
    return (
      <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <ShieldCheck className="mr-1 h-3 w-3" /> Đã duyệt
      </Badge>
    );
  }
  if (complete) {
    return (
      <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Hoàn thành
      </Badge>
    );
  }
  if (locked) {
    return (
      <Badge variant="secondary" className="rounded-full">
        <Lock className="mr-1 h-3 w-3" /> Khoá
      </Badge>
    );
  }
  if (unlocked) {
    return (
      <Badge className="rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
        Đang mở
      </Badge>
    );
  }
  return null;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm">
        <FileText className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-medium text-muted-foreground">{text}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function getQuestionOptions(question: OnboardingQuestion) {
  return Array.isArray(question.options)
    ? question.options.filter((item): item is string => typeof item === "string")
    : [];
}

function isSectionReviewRequired(section: OnboardingSection) {
  return section.section_key === "intro" || section.sort_order === 1;
}

function getAnswerStatus(answer?: OnboardingAnswer | null): OnboardingAnswerStatus {
  if (!answer) return "open";
  const status = answer.status;
  if (
    status === "locked" ||
    status === "open" ||
    status === "submitted" ||
    status === "approved" ||
    status === "rejected"
  ) {
    return status;
  }
  return "approved";
}

function isSectionQuizApproved(section: OnboardingSection, answer?: OnboardingAnswer | null) {
  if (!answer) return false;
  const status = getAnswerStatus(answer);
  if (isSectionReviewRequired(section)) return status === "approved";
  return status === "approved";
}

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatAnswerValue(value: Json | undefined) {
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string");
    return values.length ? values.join(", ") : "—";
  }
  if (typeof value === "string") return value.trim() || "—";
  if (value === null || value === undefined) return "—";
  return String(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function groupBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const value = String(item[key] ?? "");
    if (!map.has(value)) map.set(value, []);
    map.get(value)!.push(item);
  });
  return map;
}

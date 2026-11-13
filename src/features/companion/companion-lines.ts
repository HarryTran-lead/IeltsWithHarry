import type { HarryMood } from "@/components/companion/harry-moods";

/*
 * Everything Harry can say, grouped by the moment that triggers it.
 * Placeholders: {name} learner's first name (falls back to "bạn"),
 * {minutes} minutes studied today, {streak} current streak, {count} a number
 * that belongs to the moment (unread stories, score...), {total} quiz total,
 * {goal} today's minute goal.
 * Keep lines short (≤ ~120 chars): they sit in a small speech bubble.
 *
 * A line can offer reply buttons (`choices`). A choice either answers on the
 * spot (`say`), moves the chat to another trigger (`next`), or sets today's
 * study goal (`goal`, in minutes). This is what makes Harry feel like a chat
 * rather than a notification.
 */

export type CompanionAction = { label: string; href?: string; kind?: "dismiss" | "break" };
export type CompanionChoice = {
  label: string;
  say?: string;
  mood?: HarryMood;
  next?: CompanionTrigger;
  action?: CompanionAction;
  goal?: number;
  /** Reply buttons shown after `say`. */
  then?: CompanionChoice[];
};
export type CompanionLine = { text: string; mood?: HarryMood; action?: CompanionAction; choices?: CompanionChoice[] };

export type CompanionTrigger =
  // Greetings and calendar
  | "greet_morning" | "greet_noon" | "greet_afternoon" | "greet_evening" | "greet_night"
  | "welcome_back" | "weekend" | "early_bird" | "monday" | "friday" | "sunday_evening" | "tab_return"
  | "day_new_year" | "day_valentine" | "day_women" | "day_children" | "day_teacher" | "day_halloween" | "day_christmas"
  // How the learner feels today
  | "check_in" | "mood_great" | "mood_ok" | "mood_tired" | "mood_stressed" | "mood_bored"
  // Daily goal
  | "goal_ask" | "goal_set" | "goal_half" | "goal_reached"
  // Time on task
  | "study_10" | "study_20" | "study_30" | "study_45" | "study_60" | "study_90" | "study_120"
  | "break_reminder" | "break_start" | "break_over"
  // Streak
  | "streak_first" | "streak_kept" | "streak_milestone" | "streak_strong" | "streak_risk" | "streak_risk_late" | "streak_restart"
  // What was just done (from today's activity kinds)
  | "did_lesson" | "did_news_read" | "did_news_quiz" | "did_word" | "did_notebook" | "did_task"
  | "did_study_room" | "did_dictation" | "did_ielts" | "did_generic" | "busy_day"
  // Scores
  | "score_perfect" | "score_good" | "score_ok" | "score_low" | "score_hot_streak" | "score_tough" | "score_comeback"
  // Daily News
  | "news_unread" | "news_nudge"
  // Page arrivals
  | "page_reading" | "page_listening" | "page_writing" | "page_speaking" | "page_vocabulary" | "page_grammar"
  | "page_news" | "page_planner" | "page_progress" | "page_notebook" | "page_learn" | "page_study_room"
  // Chat started by tapping Harry
  | "chat_menu" | "chat_quiz" | "chat_fact" | "chat_cheer" | "chat_joke" | "chat_about" | "chat_suggest"
  | "suggest_news" | "suggest_vocab" | "suggest_lesson" | "suggest_listening" | "suggest_writing" | "suggest_rest"
  // Idle and fun
  | "idle" | "idle_long" | "tap" | "tip" | "word_of_moment" | "late_night";

const toNews: CompanionAction = { label: "Đọc báo ngay", href: "/app/news" };
const toLearn: CompanionAction = { label: "Học 5 phút", href: "/app/learn" };
const toVocab: CompanionAction = { label: "Ôn 10 từ", href: "/app/vocabulary/review" };
const toListening: CompanionAction = { label: "Nghe 1 bài", href: "/app/listening" };
const toWriting: CompanionAction = { label: "Viết thử", href: "/app/writing" };
const toSpeaking: CompanionAction = { label: "Luyện nói", href: "/app/speaking" };
const toReading: CompanionAction = { label: "Đọc 1 bài", href: "/app/reading" };
const toProgress: CompanionAction = { label: "Xem tiến độ", href: "/app/progress" };
const toPlanner: CompanionAction = { label: "Mở kế hoạch", href: "/app/planner" };
const takeBreak: CompanionAction = { label: "Nghỉ 5 phút", kind: "break" };
const goodnight: CompanionAction = { label: "Chúc ngủ ngon", kind: "dismiss" };

/** Reply buttons used by several lines. */
const feelingChoices: CompanionChoice[] = [
  { label: "Hào hứng 😄", next: "mood_great" },
  { label: "Bình thường 🙂", next: "mood_ok" },
  { label: "Hơi mệt 😪", next: "mood_tired" },
  { label: "Áp lực 😰", next: "mood_stressed" },
];
const goalChoices: CompanionChoice[] = [
  { label: "10 phút", goal: 10, next: "goal_set" },
  { label: "20 phút", goal: 20, next: "goal_set" },
  { label: "30 phút", goal: 30, next: "goal_set" },
  { label: "60 phút", goal: 60, next: "goal_set" },
];
const menuChoices: CompanionChoice[] = [
  { label: "Đố mình đi", next: "chat_quiz" },
  { label: "Gợi ý học gì", next: "chat_suggest" },
  { label: "Động viên mình", next: "chat_cheer" },
  { label: "Kể gì vui đi", next: "chat_joke" },
];
const moreQuiz: CompanionChoice = { label: "Câu nữa!", next: "chat_quiz" };

/** A quick question; `right` is the correct option, shuffled among the wrong ones. */
function quiz(text: string, right: [string, string], wrong: [string, string][]): CompanionLine {
  const choices: CompanionChoice[] = [
    { label: right[0], say: right[1], mood: "cheer", then: [moreQuiz] },
    ...wrong.map(([label, say]): CompanionChoice => ({ label, say, mood: "thinking", then: [moreQuiz] })),
  ];
  // Shuffle so the right answer is not always first; stable per line text.
  const seed = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return { text, mood: "thinking", choices: choices.map((choice, index) => ({ choice, key: (index * 7 + seed) % 5 })).sort((a, b) => a.key - b.key).map(({ choice }) => choice) };
}

export const companionLines: Record<CompanionTrigger, CompanionLine[]> = {
  /* ───────── Greetings ───────── */
  greet_morning: [
    { text: "Chào buổi sáng {name}! Một bài nhỏ trước giờ làm việc là cả ngày tràn năng lượng đó ☀️", mood: "wave" },
    { text: "Good morning, {name}! Não buổi sáng nhớ từ vựng tốt lắm, tranh thủ nha.", mood: "wave", action: toVocab },
    { text: "Sáng nay Harry pha cà phê rồi, còn bạn đã sẵn sàng học chưa?", mood: "happy", choices: [{ label: "Sẵn sàng!", next: "goal_ask" }, { label: "Chưa tỉnh lắm 😴", next: "mood_tired" }] },
    { text: "Rise and shine! Hôm nay mình làm một bài Reading ngắn nhé?", mood: "cheer", action: toReading },
    { text: "Buổi sáng tốt lành {name}! Đọc một tin tiếng Anh cho tỉnh ngủ không?", mood: "news", action: toNews },
    { text: "Chào {name}! Sáng nay bạn thấy thế nào?", mood: "wave", choices: feelingChoices },
  ],
  greet_noon: [
    { text: "Trưa rồi {name}! Ăn no rồi học 10 phút cho tiêu cơm nha 🍱", mood: "happy" },
    { text: "Giờ nghỉ trưa mà ghé học thì đúng là chăm thật đó!", mood: "proud" },
    { text: "Lunch break = vocab break. Ôn vài từ rồi chợp mắt nhé.", mood: "reading", action: toVocab },
    { text: "Trưa nay ăn gì đó {name}? Học xong một bài rồi kể Harry nghe nha 😋", mood: "happy", choices: [{ label: "Cơm tấm!", say: "Ngon nha! Cơm tấm tiếng Anh là “broken rice” đó, nghe lạ ghê 😆", mood: "cheer" }, { label: "Phở!", say: "Phở thì người nước ngoài vẫn gọi là “pho” luôn, nổi tiếng thế giới rồi 🍜", mood: "proud" }, { label: "Chưa ăn 😢", say: "Đi ăn đã nào! Học khi đói là não không chịu làm việc đâu.", mood: "worried" }] },
  ],
  greet_afternoon: [
    { text: "Chào buổi chiều {name}! Mình học tiếp từ chỗ hôm qua nhé?", mood: "wave", action: toLearn },
    { text: "Chiều hơi buồn ngủ? Một bài Listening sẽ đánh thức tai bạn đấy 🎧", mood: "happy", action: toListening },
    { text: "Good afternoon! Hôm nay bạn muốn luyện kỹ năng nào nhất?", mood: "thinking", choices: [{ label: "Reading", next: "page_reading" }, { label: "Listening", next: "suggest_listening" }, { label: "Writing", next: "suggest_writing" }, { label: "Từ vựng", next: "suggest_vocab" }] },
    { text: "Chiều nay năng lượng của bạn mấy phần trăm rồi?", mood: "thinking", choices: feelingChoices },
  ],
  greet_evening: [
    { text: "Chào buổi tối {name}! Xong việc rồi thì học cùng Harry một chút nha.", mood: "wave" },
    { text: "Tối nay mình đọc một bài báo rồi làm quiz 5 câu nhé?", mood: "news", action: toNews },
    { text: "Evening study squad có bạn rồi! Bắt đầu nhẹ nhàng thôi.", mood: "cheer" },
    { text: "Buổi tối là lúc tốt để viết. Thử một đoạn Writing ngắn không?", mood: "reading", action: toWriting },
    { text: "Hôm nay của bạn thế nào {name}? Kể Harry nghe với.", mood: "love", choices: feelingChoices },
  ],
  greet_night: [
    { text: "Khuya rồi mà vẫn học, nể bạn thật! Nhưng nhớ ngủ sớm nha 🌙", mood: "sleepy" },
    { text: "Night owl mode! Ôn nhẹ vài từ rồi đi ngủ, não sẽ tự ghi nhớ khi bạn ngủ đó.", mood: "sleepy", action: toVocab },
    { text: "Giờ này học nhẹ thôi nha: 10 từ vựng là vừa đẹp, rồi đi ngủ.", mood: "sleepy", choices: [{ label: "Ok, 10 từ", say: "Deal! Ôn xong thì tắt máy ngủ ngon nhé 😴", mood: "happy", action: toVocab }, { label: "Mình còn tỉnh lắm", say: "Vậy làm 1 bài Reading ngắn, nhưng hứa đi ngủ trước 12 giờ nha!", mood: "worried", action: toReading }] },
  ],
  welcome_back: [
    { text: "{name} quay lại rồi! Harry nhớ bạn lắm đó 🥹 Mình bắt đầu lại nhẹ nhàng nhé.", mood: "love" },
    { text: "Lâu quá không gặp! Không sao cả, quan trọng là hôm nay bạn đã ở đây.", mood: "wave", action: toLearn },
    { text: "Welcome back! Thử 1 bài thật ngắn để khởi động lại nha.", mood: "cheer", action: toLearn },
    { text: "A, {name} đây rồi! Mấy hôm nay bạn bận gì vậy?", mood: "wave", choices: [{ label: "Bận việc quá", say: "Hiểu mà! Hôm nay chỉ cần 10 phút thôi, Harry không đòi nhiều đâu 😊", mood: "love", action: toLearn }, { label: "Lười một chút 😅", say: "Haha thật thà ghê! Ai cũng có lúc vậy. Quay lại là giỏi rồi 💪", mood: "cheer", action: toLearn }, { label: "Đi chơi!", say: "Vui chưa? Giờ nạp lại chút tiếng Anh cho cân bằng nhé 🎒", mood: "happy", action: toVocab }] },
  ],
  weekend: [
    { text: "Cuối tuần rồi! Thử làm một đề Reading full để xem mình tiến bộ đến đâu?", mood: "cheer", action: { label: "Làm full đề", href: "/app/reading?type=full_test" } },
    { text: "Weekend vibes 😎 Học ít thôi cũng được, miễn là giữ được chuỗi nhé.", mood: "happy" },
    { text: "Cuối tuần có kế hoạch gì chưa {name}?", mood: "thinking", choices: [{ label: "Làm đề thi thử", say: "Chuẩn tinh thần chiến binh! Nhớ bấm giờ như thi thật nha ⏱️", mood: "fire", action: { label: "Làm full đề", href: "/app/reading?type=full_test" } }, { label: "Ôn lại cả tuần", say: "Ôn lại là cách nhớ lâu nhất. Bắt đầu từ sổ từ vựng nhé!", mood: "proud", action: toVocab }, { label: "Nghỉ ngơi thôi", say: "Nghỉ cũng quan trọng! Chỉ cần 1 bài nhỏ giữ chuỗi là đủ 😉", mood: "love" }] },
  ],
  early_bird: [
    { text: "Học từ sáng sớm thế này, {name} đúng là early bird 🐦 Người dậy sớm học gì cũng vào!", mood: "proud" },
    { text: "Trời còn chưa sáng hẳn mà bạn đã học rồi. Harry nể thật sự!", mood: "cheer" },
  ],
  monday: [
    { text: "Thứ Hai rồi! Tuần mới, mục tiêu mới. Tuần này bạn muốn tập trung vào gì?", mood: "fire", choices: [{ label: "Từ vựng", say: "Mỗi ngày 10 từ, cuối tuần là 70 từ mới. Đi thôi!", mood: "reading", action: toVocab }, { label: "Listening", say: "Mỗi ngày 1 bài nghe nhé, tai sẽ quen dần nhanh lắm 🎧", mood: "happy", action: toListening }, { label: "Writing", say: "Tuần này viết 2 bài Task 2 nha. Harry sẽ nhắc bạn!", mood: "thinking", action: toWriting }] },
    { text: "Monday blues? Một bài học nhỏ sẽ làm thứ Hai bớt “blue” đó 💙", mood: "happy", action: toLearn },
  ],
  friday: [
    { text: "Thứ Sáu rồi! Học nốt hôm nay rồi cuối tuần thảnh thơi nha 🎉", mood: "cheer" },
    { text: "TGIF! Thank God It's Friday. Tuần này bạn đã cố gắng nhiều lắm rồi.", mood: "proud", action: toProgress },
  ],
  sunday_evening: [
    { text: "Tối Chủ nhật là lúc lý tưởng để lên kế hoạch tuần mới. Mở planner không {name}?", mood: "thinking", action: toPlanner },
    { text: "Tuần này bạn học tốt không? Nhìn lại tiến độ một chút nha.", mood: "reading", action: toProgress },
  ],
  tab_return: [
    { text: "A, bạn quay lại rồi! Mình học tiếp nha 😊", mood: "wave" },
    { text: "Welcome back! Harry vẫn giữ chỗ cho bạn nè.", mood: "happy" },
    { text: "Đi đâu lâu thế? Harry tưởng bạn bỏ Harry rồi 🥺", mood: "love" },
  ],

  /* ───────── Special days ───────── */
  day_new_year: [
    { text: "Happy New Year {name}! 🎆 Năm nay mình cùng đạt band mục tiêu nhé!", mood: "cheer" },
    { text: "Năm mới, “new year's resolution” của bạn có tiếng Anh không đó?", mood: "proud", choices: [{ label: "Có chứ!", say: "Tuyệt! Harry sẽ đồng hành cả năm luôn 💪", mood: "fire" }, { label: "Giờ thêm vào", say: "Quyết định sáng suốt! Bắt đầu bằng 10 phút hôm nay nhé.", mood: "cheer", action: toLearn }] },
  ],
  day_valentine: [
    { text: "Happy Valentine's Day 💝 Hôm nay yêu bản thân bằng cách học thêm 1 bài nha!", mood: "love" },
    { text: "Từ của ngày Valentine: “crush” – người mình thầm thích. Còn crush của Harry là… người chăm học 😳", mood: "love" },
  ],
  day_women: [
    { text: "Chúc mừng ngày Phụ nữ! 🌷 Gửi những bạn nữ đang miệt mài học: bạn tuyệt lắm!", mood: "love" },
    { text: "Hôm nay là ngày của phụ nữ 💐 Bạn đã nhắn chúc mẹ, chị em gái chưa?", mood: "love" },
  ],
  day_children: [
    { text: "Happy Children's Day! 🎈 Hôm nay học vui như trẻ con thôi, không áp lực nha.", mood: "cheer" },
  ],
  day_teacher: [
    { text: "Chúc mừng ngày Nhà giáo Việt Nam 20/11! 💐 Bạn đã cảm ơn thầy cô của mình chưa?", mood: "love" },
    { text: "Hôm nay tri ân thầy cô! Gửi một lời cảm ơn bằng tiếng Anh thử xem: “Thank you for everything!”", mood: "proud" },
  ],
  day_halloween: [
    { text: "Happy Halloween! 🎃 Điều đáng sợ nhất hôm nay là… quên ôn từ vựng 👻", mood: "cheer", action: toVocab },
  ],
  day_christmas: [
    { text: "Merry Christmas {name}! 🎄 Món quà Harry muốn tặng bạn là một chuỗi học thật dài!", mood: "love" },
    { text: "Giáng sinh vui vẻ! Từ hôm nay: “festive” – không khí lễ hội 🎅", mood: "cheer" },
  ],

  /* ───────── How the learner feels ───────── */
  check_in: [
    { text: "Hôm nay bạn thấy thế nào {name}?", mood: "thinking", choices: feelingChoices },
    { text: "Harry hỏi nhỏ: tâm trạng học hôm nay ra sao?", mood: "love", choices: feelingChoices },
    { text: "Trước khi học tiếp, kể Harry nghe năng lượng của bạn đang ở đâu nào?", mood: "happy", choices: feelingChoices },
  ],
  mood_great: [
    { text: "Tuyệt vời! Năng lượng này mà làm một đề full thì hết sẩy 🔥", mood: "fire", action: { label: "Làm full đề", href: "/app/reading?type=full_test" } },
    { text: "Yay! Hôm nay mình đặt mục tiêu cao một chút nhé?", mood: "cheer", choices: goalChoices },
    { text: "Thích quá! Tranh thủ học phần khó nhất lúc đang hưng phấn nha.", mood: "proud", action: toWriting },
  ],
  mood_ok: [
    { text: "Bình thường là ổn rồi! Mình học vừa sức, đều đặn là thắng.", mood: "happy", choices: goalChoices },
    { text: "Ok nè. Một bài vừa phải rồi thưởng cho mình ly trà sữa nhé 🧋", mood: "happy", action: toLearn },
  ],
  mood_tired: [
    { text: "Mệt thì học nhẹ thôi: 5 phút ôn từ là đủ giữ chuỗi rồi. Harry không ép đâu 💛", mood: "love", action: toVocab },
    { text: "Thương ghê! Hay mình nghe một bài Listening ngắn, nằm nghe cũng được 🎧", mood: "sleepy", action: toListening },
    { text: "Nghỉ ngơi là một phần của học. Uống nước, ngủ sớm, mai mình chiến tiếp nha.", mood: "sleepy", action: goodnight },
  ],
  mood_stressed: [
    { text: "Hít sâu 4 giây, giữ 4 giây, thở ra 4 giây nào 🌬️ Bạn đang làm tốt hơn bạn nghĩ.", mood: "love" },
    { text: "Áp lực vì kỳ thi hả? Chia nhỏ ra: hôm nay chỉ cần xong 1 việc thôi.", mood: "love", choices: goalChoices },
    { text: "Harry ở đây nè. Điểm số không định nghĩa bạn, sự cố gắng mới là điều đáng giá 💛", mood: "love", choices: [{ label: "Cảm ơn Harry", say: "Không có gì! Mình học cùng nhau, từng bước một nha 🤝", mood: "happy" }, { label: "Động viên thêm đi", next: "chat_cheer" }] },
  ],
  mood_bored: [
    { text: "Chán hả? Đổi gió đi: đọc một tin tức thú vị thay vì làm bài tập!", mood: "news", action: toNews },
    { text: "Thử chơi đố vui với Harry cho đỡ chán không?", mood: "cheer", choices: [{ label: "Chơi luôn!", next: "chat_quiz" }, { label: "Kể chuyện vui đi", next: "chat_joke" }] },
  ],

  /* ───────── Daily goal ───────── */
  goal_ask: [
    { text: "Hôm nay mình đặt mục tiêu học bao nhiêu phút nào {name}?", mood: "thinking", choices: goalChoices },
    { text: "Đặt một mục tiêu nhỏ cho hôm nay nhé? Harry sẽ theo dõi giúp bạn.", mood: "happy", choices: goalChoices },
  ],
  goal_set: [
    { text: "Chốt! Mục tiêu hôm nay: {goal} phút. Harry sẽ báo khi bạn đi được nửa đường 🚩", mood: "fire" },
    { text: "{goal} phút, nghe rất khả thi! Bắt đầu thôi nào 💪", mood: "cheer", action: toLearn },
    { text: "Ok, {goal} phút nhé. Mục tiêu nhỏ mà đều mới là bí quyết!", mood: "proud" },
  ],
  goal_half: [
    { text: "Đi được nửa đường rồi! {minutes}/{goal} phút. Cố lên {name}! 🏃", mood: "fire" },
    { text: "Một nửa mục tiêu xong rồi đó. Phần còn lại dễ hơn nhiều!", mood: "cheer" },
  ],
  goal_reached: [
    { text: "Đạt mục tiêu {goal} phút rồi! 🎯 Hôm nay bạn đã giữ lời hứa với chính mình.", mood: "cheer" },
    { text: "Mission complete! {goal} phút đã xong. Học thêm hay nghỉ ngơi đây?", mood: "proud", choices: [{ label: "Học thêm!", say: "Đỉnh quá! Mọi phút từ giờ đều là bonus 🌟", mood: "fire" }, { label: "Nghỉ thôi", say: "Xứng đáng lắm! Hẹn bạn ngày mai nhé 👋", mood: "wave" }] },
  ],

  /* ───────── Time on task ───────── */
  study_10: [
    { text: "10 phút rồi đó! Khởi động xong, giờ mới vào guồng nè 💪", mood: "happy" },
    { text: "Bạn đã học 10 phút hôm nay. Small steps, big progress!", mood: "proud" },
    { text: "10 phút đầu tiên luôn là khó nhất, và bạn đã vượt qua rồi!", mood: "cheer" },
  ],
  study_20: [
    { text: "20 phút tập trung, tuyệt vời {name}!", mood: "cheer" },
    { text: "Đã 20 phút rồi. Bạn đang làm tốt hơn 80% kế hoạch “mai học” của mọi người đó 😆", mood: "proud" },
    { text: "20 phút! Não bạn đang nóng máy đúng nhiệt độ lý tưởng 🌡️", mood: "fire" },
  ],
  study_30: [
    { text: "Wow, bạn đã dành 30 phút để học hôm nay! Harry tự hào lắm 🎉", mood: "cheer" },
    { text: "30 phút rồi! Đủ một buổi học chất lượng. Muốn học thêm hay nghỉ chút?", mood: "proud", choices: [{ label: "Học tiếp!", say: "Chiến binh thật sự! Harry cổ vũ hết mình 📣", mood: "fire" }, { label: "Nghỉ chút", say: "Hợp lý! Harry bấm giờ cho bạn nhé.", mood: "sleepy", action: takeBreak }] },
    { text: "Nửa tiếng học tiếng Anh mỗi ngày là công thức của band cao đó {name}!", mood: "fire" },
  ],
  study_45: [
    { text: "45 phút! Bạn đúng là chiến binh IELTS 🔥", mood: "fire" },
    { text: "Đã 45 phút. Đứng dậy vươn vai một chút rồi chiến tiếp nha.", mood: "happy", action: takeBreak },
  ],
  study_60: [
    { text: "1 tiếng học hôm nay! Bạn xứng đáng một tràng pháo tay 👏", mood: "cheer" },
    { text: "60 phút tập trung, một con số rất đáng nể. Uống nước chưa đó?", mood: "proud", choices: [{ label: "Rồi nè 💧", say: "Giỏi! Não cần nước để làm việc đó.", mood: "happy" }, { label: "Chưa…", say: "Đi uống ly nước liền nha, Harry chờ!", mood: "worried", action: takeBreak }] },
  ],
  study_90: [
    { text: "90 phút rồi! Siêu chăm luôn. Nhớ cho mắt nghỉ 20 giây nhìn ra xa nhé.", mood: "proud", action: takeBreak },
    { text: "Một tiếng rưỡi! Nhiều người cả tuần chưa học được bằng bạn hôm nay đâu.", mood: "fire" },
  ],
  study_120: [
    { text: "2 tiếng học! Bạn là huyền thoại hôm nay rồi 🏆 Nghỉ ngơi cũng là một phần của học nhé.", mood: "cheer", action: takeBreak },
    { text: "120 phút! Harry phải trao huy chương cho bạn mất 🥇", mood: "proud" },
  ],
  break_reminder: [
    { text: "Bạn học liền gần 50 phút rồi. Nghỉ 5 phút để não kịp “lưu file” nha 🧠", mood: "sleepy", action: takeBreak },
    { text: "Mắt mỏi chưa? Quy tắc 20-20-20: cứ 20 phút nhìn xa 20 feet trong 20 giây.", mood: "thinking", action: takeBreak },
    { text: "Đứng dậy uống ly nước, vươn vai rồi quay lại nhé. Harry giữ chỗ cho!", mood: "happy", action: takeBreak },
    { text: "Học lâu quá rồi đó! Nghỉ một chút nhé?", mood: "worried", choices: [{ label: "Nghỉ 5 phút", say: "Ok! Harry bấm giờ nha ⏱️", mood: "sleepy", action: takeBreak }, { label: "Cho mình làm nốt", say: "Được thôi! Xong bài này nhớ nghỉ nha, hứa đó 🤙", mood: "happy" }] },
  ],
  break_start: [
    { text: "Ok! Harry bấm giờ 5 phút. Đi uống nước, vươn vai đi nào ☕", mood: "sleepy" },
    { text: "Nghỉ thôi! 5 phút nữa Harry gọi bạn quay lại nha.", mood: "sleepy" },
    { text: "Giờ giải lao! Nhìn ra cửa sổ, thả lỏng vai, Harry canh giờ cho 🕔", mood: "sleepy" },
  ],
  break_over: [
    { text: "Hết 5 phút rồi! Não đã sạc đầy, mình học tiếp nhé 💪", mood: "cheer" },
    { text: "Ding ding! Giờ nghỉ kết thúc. Quay lại chiến tiếp nào {name}!", mood: "wave" },
    { text: "Nghỉ xong rồi! Sẵn sàng chưa?", mood: "wave", choices: [{ label: "Sẵn sàng!", say: "Let's go! 🚀", mood: "fire" }, { label: "Thêm 5 phút 🥺", say: "Thôi được, thêm 5 phút nữa thôi nha!", mood: "sleepy", action: takeBreak }] },
  ],

  /* ───────── Streak ───────── */
  streak_first: [
    { text: "Ngày 1 của chuỗi mới! Mọi hành trình dài đều bắt đầu từ đây 🌱", mood: "cheer" },
    { text: "Chuỗi bắt đầu rồi! Mai quay lại để lên ngày 2 nha {name}.", mood: "fire" },
  ],
  streak_kept: [
    { text: "Chuỗi {streak} ngày đã được giữ! Hôm nay xong nhiệm vụ rồi đó 🔥", mood: "fire" },
    { text: "Yes! Lửa chuỗi vẫn cháy: {streak} ngày liên tiếp.", mood: "cheer" },
    { text: "{streak} ngày không bỏ cuộc. Đây là thói quen thật sự rồi {name}!", mood: "proud" },
  ],
  streak_milestone: [
    { text: "🎉 CHUỖI {streak} NGÀY! Một cột mốc đáng nhớ. Harry tự hào về bạn lắm!", mood: "cheer" },
    { text: "{streak} ngày liên tiếp! Bạn đã chứng minh mình làm được. Chụp màn hình khoe đi 📸", mood: "proud" },
    { text: "Wow {name}, {streak} ngày! Lửa chuỗi của bạn giờ to bằng ngọn đuốc rồi 🔥", mood: "fire", action: toProgress },
  ],
  streak_strong: [
    { text: "Chuỗi {streak} ngày đang chờ bạn tiếp lửa hôm nay 🔥", mood: "fire" },
    { text: "{streak} ngày liên tục! Đừng để con số đẹp này dừng lại nhé.", mood: "proud" },
  ],
  streak_risk: [
    { text: "Ơ, hôm nay mình chưa học gì cả! Chuỗi {streak} ngày đang chờ bạn đó 🥺", mood: "worried", action: toLearn },
    { text: "Nhắc nhẹ: chỉ cần 1 bài nhỏ là giữ được chuỗi {streak} ngày.", mood: "worried", action: toVocab },
    { text: "Đọc 1 bài báo cũng tính là học đó! Giữ chuỗi dễ lắm.", mood: "news", action: toNews },
    { text: "Chuỗi {streak} ngày sắp cần bạn rồi. Làm gì nhanh nhất đây?", mood: "worried", choices: [{ label: "Ôn 10 từ", say: "Nhanh gọn! 3 phút là xong 💨", mood: "fire", action: toVocab }, { label: "Đọc 1 tin", say: "Chọn tin ngắn nhất là được nha 📰", mood: "news", action: toNews }] },
  ],
  streak_risk_late: [
    { text: "Sắp hết ngày rồi {name}! Làm nhanh 1 bài để không mất chuỗi {streak} ngày nha 😰", mood: "worried", action: toVocab },
    { text: "Còn vài tiếng thôi! Harry không muốn thấy lửa chuỗi tắt đâu…", mood: "worried", action: toLearn },
    { text: "SOS! Chuỗi {streak} ngày đang gặp nguy 🚨 3 phút ôn từ là cứu được!", mood: "worried", action: toVocab },
  ],
  streak_restart: [
    { text: "Chuỗi cũ dừng rồi, nhưng kỷ lục {count} ngày vẫn là của bạn. Mình bắt đầu lại nhé!", mood: "love", action: toLearn },
    { text: "Ngã thì đứng dậy thôi! Hôm nay là ngày 1 mới.", mood: "cheer", action: toLearn },
    { text: "Đứt chuỗi không sao cả. Người giỏi không phải người không bao giờ dừng, mà là người luôn quay lại 💛", mood: "love" },
  ],

  /* ───────── Just did something ───────── */
  did_lesson: [
    { text: "Xong một bài học rồi! Bạn học giỏi quá {name} 🌟", mood: "proud" },
    { text: "Bài học hoàn thành! Tiếp bài sau hay ôn lại từ mới đây?", mood: "cheer", choices: [{ label: "Bài tiếp theo", say: "Đà đang lên mà! Đi thôi 🚀", mood: "fire", action: toLearn }, { label: "Ôn từ mới", say: "Ôn ngay khi vừa học là nhớ lâu gấp đôi đó!", mood: "reading", action: toVocab }] },
    { text: "Bài học hôm nay khó không {name}?", mood: "thinking", choices: [{ label: "Dễ ợt 😎", say: "Vậy bài sau thử mức khó hơn nha!", mood: "proud" }, { label: "Vừa sức", say: "Vừa sức là học hiệu quả nhất đó 👍", mood: "happy" }, { label: "Hơi khó 😵", say: "Khó là đang tiến bộ! Xem lại phần giải thích một lần nữa nhé.", mood: "love" }] },
  ],
  did_news_read: [
    { text: "Đọc xong cả bài báo tiếng Anh! Đó là luyện Reading thật sự đó 📰", mood: "proud" },
    { text: "Một bài báo nữa vào kho kiến thức. Thử làm quiz để chắc chắn hiểu hết nhé?", mood: "news" },
    { text: "Bài báo vừa rồi có hay không {name}?", mood: "news", choices: [{ label: "Hay lắm!", say: "Tuyệt! Nhớ lưu vài từ hay vào sổ để dùng trong Writing nha ✍️", mood: "cheer" }, { label: "Hơi khó hiểu", say: "Bình thường thôi! Đọc lại đoạn đầu và đoạn cuối, ý chính hay nằm ở đó.", mood: "thinking" }] },
  ],
  did_news_quiz: [
    { text: "Quiz xong rồi! Đọc báo + làm quiz là combo hoàn hảo 👌", mood: "cheer" },
    { text: "Hoàn thành quiz tin tức! Bạn vừa luyện cả đọc hiểu lẫn từ vựng đó.", mood: "proud" },
  ],
  did_word: [
    { text: "Đã lưu từ mới! Nhớ đặt một câu với nó để nhớ lâu hơn nhé ✍️", mood: "reading" },
    { text: "Từ mới vào sổ rồi. Mai Harry nhắc bạn ôn lại nha!", mood: "happy" },
    { text: "Thêm một từ vào kho! Người có vốn từ lớn là người lưu từng từ một như vậy đó.", mood: "proud" },
  ],
  did_notebook: [
    { text: "Ghi chép chăm quá! Người ghi chép là người nhớ lâu đó.", mood: "reading" },
    { text: "Sổ tay của bạn ngày càng dày rồi 📒 Cuối tuần ôn lại nhé.", mood: "happy" },
  ],
  did_task: [
    { text: "Tick xong một nhiệm vụ! Cảm giác này phê lắm đúng không ✅", mood: "cheer" },
    { text: "Một việc nữa đã xong. Danh sách việc cần làm đang ngắn dần kìa!", mood: "proud" },
  ],
  did_study_room: [
    { text: "Học cùng mọi người vui hơn hẳn nhỉ! Tiếp tục giữ nhịp nha.", mood: "happy" },
    { text: "Phòng học chung có bạn là có động lực. Hẹn gặp lại ở phiên sau!", mood: "wave" },
  ],
  did_dictation: [
    { text: "Chép chính tả là bài tập đôi tai số 1. Bạn làm tốt lắm 🎧", mood: "proud" },
    { text: "Dictation xong! Từ nào nghe sai thì nghe lại 3 lần nữa nhé.", mood: "thinking" },
  ],
  did_ielts: [
    { text: "Thêm một đề IELTS nữa! Mỗi đề là một lần làm quen với phòng thi thật.", mood: "fire" },
    { text: "Làm đề xong rồi! Nhớ xem lại câu sai, đó mới là phần tăng band.", mood: "thinking" },
    { text: "Một đề nữa vào túi! Bạn thấy mình làm phần nào tốt nhất?", mood: "proud", choices: [{ label: "Phần đầu", say: "Vậy phần sau cần tăng tốc. Thử bấm giờ chặt hơn nha ⏱️", mood: "thinking" }, { label: "Đều đều", say: "Ổn định là điều tuyệt vời trong phòng thi đó 👍", mood: "happy" }, { label: "Không biết nữa", say: "Mở phần xem lại đáp án nhé, Harry tin bạn sẽ tìm ra điểm cần sửa.", mood: "love" }] },
  ],
  did_generic: [
    { text: "Làm tốt lắm {name}! Mỗi bài luyện đều có giá trị.", mood: "proud" },
    { text: "Thêm một bước tiến nữa rồi! 👣", mood: "happy" },
    { text: "Good job! Harry đang ghi nhận từng nỗ lực của bạn đó.", mood: "cheer" },
    { text: "Xong thêm một việc! Bạn đang tích lũy từng chút một, và nó cộng dồn đó 📈", mood: "proud" },
  ],
  busy_day: [
    { text: "Hôm nay bạn đã làm {count} hoạt động rồi! Một ngày năng suất thật sự 🏅", mood: "cheer" },
    { text: "{count} việc học trong một ngày! {name} đang ở phong độ đỉnh cao đó.", mood: "fire" },
  ],

  /* ───────── Scores ───────── */
  score_perfect: [
    { text: "{count}/{total}! Tuyệt đối luôn! Bạn học giỏi quá đi 🏆", mood: "cheer" },
    { text: "Perfect score! Harry phải xin chữ ký bạn mất 🤩", mood: "proud" },
    { text: "Không sai câu nào! {name} ơi, bạn là siêu sao hôm nay ⭐", mood: "proud" },
  ],
  score_good: [
    { text: "{count}/{total}, làm tốt lắm! Xem lại mấy câu sai là chạm điểm tối đa rồi.", mood: "proud" },
    { text: "Điểm đẹp đó {name}! Bạn đang tiến bộ thấy rõ.", mood: "happy" },
    { text: "{count}/{total}! Gần hoàn hảo rồi. Câu sai là do bẫy hay do chưa biết?", mood: "thinking", choices: [{ label: "Dính bẫy 😤", say: "Bẫy IELTS hay đổi từ đồng nghĩa lắm. Lần sau đọc kỹ keyword nhé!", mood: "thinking" }, { label: "Chưa biết", say: "Vậy là vừa học thêm được một điều mới. Lời quá còn gì!", mood: "happy" }] },
  ],
  score_ok: [
    { text: "{count}/{total}. Ổn rồi! Đọc kỹ phần giải thích để lần sau cao hơn nhé.", mood: "thinking" },
    { text: "{count}/{total}, qua nửa rồi! Thêm chút luyện tập là lên hạng ngay.", mood: "happy" },
  ],
  score_low: [
    { text: "{count}/{total} thôi, nhưng không sao! Sai là cách não học nhanh nhất đó 💛", mood: "love" },
    { text: "Bài này khó thật. Mình xem lại đáp án cùng nhau rồi làm lại nha?", mood: "worried" },
    { text: "Điểm hôm nay không định nghĩa bạn. Quan trọng là bạn đã thử!", mood: "love" },
  ],
  score_hot_streak: [
    { text: "3 bài liền điểm cao! {name} đang “on fire” thật sự 🔥🔥🔥", mood: "fire" },
    { text: "Phong độ quá ổn định! Có lẽ đã đến lúc thử mức khó hơn rồi đó.", mood: "proud" },
  ],
  score_tough: [
    { text: "Mấy bài gần đây hơi khó nhằn nhỉ. Nghỉ 5 phút rồi quay lại với đầu óc tươi mới nha 💛", mood: "love", action: takeBreak },
    { text: "Hôm nay không phải ngày của mình cũng không sao. Thử bài dễ hơn để lấy lại cảm giác nhé?", mood: "love", choices: [{ label: "Ok, bài dễ hơn", say: "Chuẩn! Lấy đà rồi mới bật cao được 🦘", mood: "happy", action: toLearn }, { label: "Mình làm lại!", say: "Tinh thần không bỏ cuộc! Harry tin bạn 💪", mood: "fire" }] },
  ],
  score_comeback: [
    { text: "Màn lội ngược dòng đẹp quá! Từ điểm thấp lên {count}/{total} 👏", mood: "cheer" },
    { text: "Thấy chưa! Sai lần trước chính là bài học cho lần này. Comeback king/queen đây rồi 👑", mood: "proud" },
  ],

  /* ───────── Daily News ───────── */
  news_unread: [
    { text: "Có {count} tin mới trên Daily News đó! Đọc một tin không {name}?", mood: "news", action: toNews },
    { text: "Báo hôm nay ra rồi 📰 {count} bài mới đang chờ bạn.", mood: "news", action: toNews },
    { text: "Ting ting! {count} bài báo mới vừa lên kệ. Harry đọc thử thấy hay lắm.", mood: "news", choices: [{ label: "Đọc ngay", say: "Let's go! Chọn chủ đề bạn thích nhất nha 📰", mood: "news", action: toNews }, { label: "Lát nữa", say: "Ok, Harry nhắc lại sau nhé 😉", mood: "happy" }] },
  ],
  news_nudge: [
    { text: "Hôm nay bạn đã đọc báo chưa? Một bài ngắn thôi cũng đủ luyện Reading rồi.", mood: "news", action: toNews },
    { text: "Đọc báo tiếng Anh mỗi ngày = vốn từ + ý tưởng cho Writing. Thử 1 bài nhé!", mood: "thinking", action: toNews },
    { text: "Harry vừa đọc một tin hay lắm. Bạn muốn xem không?", mood: "news", action: toNews },
    { text: "Đã đọc báo hôm nay chưa {name}?", mood: "news", choices: [{ label: "Đọc rồi!", say: "Giỏi quá! Kể Harry nghe sau nhé, mình thích nghe tin mới lắm 😄", mood: "proud" }, { label: "Chưa", say: "Vậy đọc một bài 3 phút thôi nha, có quiz vui nữa!", mood: "news", action: toNews }] },
  ],

  /* ───────── Page arrivals ───────── */
  page_reading: [
    { text: "Mẹo Reading: đọc câu hỏi trước, gạch keyword rồi mới scan bài nhé.", mood: "reading" },
    { text: "TRUE/FALSE/NOT GIVEN: chỉ chọn FALSE khi bài nói ngược lại rõ ràng đó.", mood: "thinking" },
    { text: "Đừng đọc từng chữ! Skim ý chính trước, scan chi tiết sau.", mood: "reading" },
    { text: "Matching headings: đọc câu đầu và câu cuối mỗi đoạn là thấy ý chính ngay.", mood: "reading" },
    { text: "Kẹt câu nào quá 2 phút thì bỏ qua, quay lại sau. Thời gian là vàng!", mood: "worried" },
  ],
  page_listening: [
    { text: "Mẹo Listening: đọc trước câu hỏi và đoán loại từ cần điền (số, tên, danh từ…).", mood: "thinking" },
    { text: "Cẩn thận bẫy đổi ý: người nói hay nói “Oh sorry, I mean…” đó 👂", mood: "worried" },
    { text: "Nhớ kiểm tra chính tả và số nhiều khi điền đáp án nha!", mood: "reading" },
    { text: "Nghe không kịp thì bỏ câu đó, tập trung câu tiếp theo. Đừng để mất dây chuyền!", mood: "thinking" },
    { text: "Đeo tai nghe vào chưa {name}? Chỗ yên tĩnh sẽ giúp bạn nghe tốt hơn nhiều đó 🎧", mood: "happy" },
  ],
  page_writing: [
    { text: "Writing: dành 5 phút lập dàn ý trước sẽ tiết kiệm 10 phút sửa sau đó.", mood: "thinking" },
    { text: "Task 2 nhớ trả lời đủ mọi phần của đề nhé, thiếu một ý là mất điểm Task Response.", mood: "reading" },
    { text: "Đa dạng cấu trúc câu, nhưng ưu tiên câu đúng trước câu phức nha!", mood: "happy" },
    { text: "Task 1 nhớ có overview: câu tóm tắt xu hướng chính là điểm ăn tiền đó.", mood: "thinking" },
    { text: "Viết xong dành 3 phút soát lỗi: chia động từ, mạo từ, số nhiều.", mood: "reading" },
  ],
  page_speaking: [
    { text: "Speaking: đừng trả lời cụt! Thêm lý do và ví dụ để kéo dài câu trả lời.", mood: "happy" },
    { text: "Nói chậm mà rõ còn hơn nói nhanh mà vấp. Thả lỏng nhé 😊", mood: "love" },
    { text: "Quên từ? Cứ diễn giải bằng từ khác, giám khảo đánh giá cao điều đó.", mood: "thinking" },
    { text: "Part 2: dùng 1 phút chuẩn bị để ghi keyword, đừng viết cả câu nha.", mood: "reading" },
    { text: "Thu âm lại câu trả lời rồi nghe lại, bạn sẽ bất ngờ với những gì mình phát hiện đó 🎙️", mood: "thinking" },
  ],
  page_vocabulary: [
    { text: "Học từ theo cụm (collocation) nhớ lâu hơn học từng từ riêng lẻ đó!", mood: "reading" },
    { text: "Đọc to từ và câu ví dụ, vừa nhớ nghĩa vừa luyện phát âm luôn.", mood: "happy" },
    { text: "Ôn đúng lúc sắp quên là nhớ lâu nhất. Đó là lý do có lịch ôn tập đó!", mood: "thinking" },
    { text: "Thử đặt một câu về chính cuộc sống của bạn với từ mới. Não thích chuyện cá nhân lắm!", mood: "love" },
  ],
  page_grammar: [
    { text: "Grammar không cần hoàn hảo, nhưng lỗi lặp lại thì phải sửa dứt điểm nha.", mood: "thinking" },
    { text: "Ghi lỗi sai vào Sổ lỗi, tuần sau ôn lại là hết sai luôn!", mood: "reading" },
    { text: "Học ngữ pháp qua ví dụ thật sẽ dễ nhớ hơn học thuộc công thức đó.", mood: "happy" },
  ],
  page_news: [
    { text: "Chọn bài theo chủ đề bạn thích, đọc sẽ vui hơn nhiều đó!", mood: "news" },
    { text: "Gặp từ hay thì bôi đen để lưu vào sổ nhé ✨", mood: "reading" },
    { text: "Đọc tiêu đề và đoán nội dung trước khi đọc, cách này giúp hiểu nhanh hơn đó!", mood: "thinking" },
  ],
  page_planner: [
    { text: "Lên kế hoạch nhỏ, làm được ngay: 3 nhiệm vụ mỗi ngày là đủ.", mood: "thinking" },
    { text: "Kế hoạch tốt là kế hoạch bạn thực sự làm được. Đừng nhồi quá nhiều nha!", mood: "happy" },
  ],
  page_progress: [
    { text: "Nhìn lại chặng đường đi! Bạn đã tiến xa hơn bạn nghĩ đó.", mood: "proud" },
    { text: "Biểu đồ đi lên là nhờ từng ngày nhỏ bạn không bỏ cuộc đó 📈", mood: "cheer" },
  ],
  page_notebook: [
    { text: "Sổ tay là kho báu của riêng bạn. Ôn lại một trang cũ không?", mood: "reading" },
    { text: "Ghi chú ngắn, có ví dụ, có màu sắc là dễ ôn nhất đó ✏️", mood: "happy" },
  ],
  page_learn: [
    { text: "Học theo lộ trình là cách nhanh nhất để không bị lạc. Tiếp bài kế nha!", mood: "happy" },
    { text: "Mỗi bài trong lộ trình là một viên gạch. Xây đều là có nhà đẹp 🏠", mood: "proud" },
  ],
  page_study_room: [
    { text: "Phòng học chung đây rồi! Có bạn đồng hành là khó bỏ cuộc lắm.", mood: "wave" },
    { text: "Học cùng nhau, tiến bộ cùng nhau! Chào mọi người một tiếng đi {name} 👋", mood: "happy" },
  ],

  /* ───────── Chat started by tapping Harry ───────── */
  chat_menu: [
    { text: "Bạn muốn Harry làm gì nè?", mood: "wave", choices: menuChoices },
    { text: "Harry rảnh nè! Mình chơi gì đây {name}?", mood: "happy", choices: menuChoices },
    { text: "Gọi Harry có việc gì đó? 😄", mood: "cheer", choices: menuChoices },
  ],
  chat_quiz: [
    quiz("Đố nhanh: “___ a decision” điền gì?", ["make", "Chuẩn! “make a decision”. Còn “do” đi với homework, research, a favour 👍"], [["do", "Gần đúng! Phải là “make a decision”. “do” dùng cho homework, research…"]]),
    quiz("Từ nào đồng nghĩa với “crucial”?", ["vital", "Chính xác! crucial = vital = essential: cực kỳ quan trọng 🌟"], [["trivial", "Ngược lại rồi! “trivial” là tầm thường. Đáp án là “vital”."]]),
    quiz("“Smoking ___ your health.” Chọn từ đúng:", ["affects", "Đúng rồi! “affect” là động từ, “effect” là danh từ 💪"], [["effects", "Chưa đúng! “effect” là danh từ. Động từ phải là “affects”."]]),
    quiz("Câu nào đúng ngữ pháp?", ["I have lived here since 2020.", "Chuẩn! Hành động kéo dài tới hiện tại + since → hiện tại hoàn thành."], [["I live here since 2020.", "Chưa đúng! Với “since” ta dùng hiện tại hoàn thành: “I have lived…”."]]),
    quiz("Số nhiều của “phenomenon” là gì?", ["phenomena", "Giỏi! phenomenon → phenomena, giống criterion → criteria 🧠"], [["phenomenons", "Chưa đúng! Từ gốc Hy Lạp này có số nhiều là “phenomena”."]]),
    quiz("Cách nói nào đúng?", ["a piece of information", "Đúng! “information” không đếm được nên không có “an information”."], [["an information", "Chưa đúng! “information” không đếm được, phải nói “a piece of information”."]]),
    quiz("IELTS Writing Task 2 cần tối thiểu bao nhiêu từ?", ["250 từ", "Chuẩn! Task 2 là 250 từ, Task 1 là 150 từ ✍️"], [["150 từ", "150 là Task 1 đó! Task 2 cần ít nhất 250 từ."]]),
    quiz("Bài Reading IELTS kéo dài bao lâu?", ["60 phút", "Đúng! 60 phút cho 40 câu và không có thêm giờ chép đáp án."], [["40 phút", "Chưa đúng! Reading có 60 phút cho 40 câu."]]),
    quiz("“___ the rain, we went out.” Chọn đáp án:", ["Despite", "Đúng! “Despite” + danh từ. Còn “Although” + mệnh đề."], [["Although", "Gần rồi! “Although” cần mệnh đề: “Although it rained…”. Ở đây là “Despite”."]]),
    quiz("Trong Writing, cụm nào trang trọng hơn?", ["a significant number of", "Chuẩn! “a lot of” hơi thân mật, Writing nên dùng cách trang trọng hơn."], [["a lot of", "“a lot of” hơi thân mật cho Writing. Thử “a significant number of” nhé!"]]),
    quiz("“accommodation” có mấy chữ m?", ["2 chữ m", "Chuẩn! acCoMModation: 2 chữ c và 2 chữ m. Từ này hay bị sai chính tả lắm!"], [["1 chữ m", "Sai rồi! Đúng là “accommodation”: 2 chữ c, 2 chữ m."]]),
    quiz("“I look forward to ___ from you.”", ["hearing", "Chính xác! “look forward to” + V-ing, vì “to” ở đây là giới từ."], [["hear", "Bẫy kinh điển! “to” ở đây là giới từ nên phải là “hearing”."]]),
    quiz("Collocation nào tự nhiên hơn?", ["heavy rain", "Đúng! Người bản xứ nói “heavy rain”, không nói “strong rain” 🌧️"], [["strong rain", "Nghe lạ tai lắm! Đúng là “heavy rain”."]]),
    quiz("“tăng trưởng kinh tế” là gì?", ["economic growth", "Chuẩn! economic = thuộc về kinh tế; economical = tiết kiệm."], [["economical growth", "“economical” là tiết kiệm đó! Phải là “economic growth”."]]),
    quiz("“fewer” đi với loại danh từ nào?", ["Đếm được", "Đúng! fewer + đếm được (fewer cars), less + không đếm được (less traffic)."], [["Không đếm được", "Ngược rồi! Không đếm được dùng “less”. “fewer” đi với danh từ đếm được."]]),
    quiz("NOT GIVEN nghĩa là gì?", ["Bài không đề cập", "Chuẩn! NOT GIVEN = không có thông tin. Bài nói ngược lại mới là FALSE."], [["Bài nói ngược lại", "Đó là FALSE! NOT GIVEN là khi bài không nhắc tới."]]),
    quiz("“be responsible ___” điền giới từ nào?", ["for", "Đúng! responsible for something 👍"], [["of", "Chưa đúng! Phải là “responsible for”."]]),
    quiz("Speaking Part 2 có bao lâu để chuẩn bị?", ["1 phút", "Chuẩn! 1 phút chuẩn bị, rồi nói tối đa 2 phút 🎙️"], [["2 phút", "Chưa đúng! Bạn có 1 phút chuẩn bị và nói tới 2 phút."]]),
    quiz("“advice” có đếm được không?", ["Không", "Đúng! Nói “some advice” hoặc “a piece of advice”, không có “advices”."], [["Có", "Bẫy đó! “advice” không đếm được. Muốn đếm thì dùng “a piece of advice”."]]),
    quiz("Từ nào thay được “increase” khi tả biểu đồ?", ["rise", "Chuẩn! rise, grow, climb đều dùng được. Còn decline là giảm 📈"], [["decline", "Ngược rồi! “decline” là giảm. Thay “increase” bằng “rise”."]]),
    quiz("Bài Listening IELTS có bao nhiêu câu hỏi?", ["40 câu", "Đúng! 4 phần, 40 câu 🎧"], [["50 câu", "Chưa đúng! Listening có 40 câu chia 4 phần."]]),
    quiz("“The number of students ___ increased.”", ["has", "Đúng! “The number of” + động từ số ít. Còn “A number of” + số nhiều."], [["have", "Bẫy rồi! “The number of” đi với động từ số ít: “has”."]]),
  ],
  chat_fact: [
    { text: "Fun fact: câu “The quick brown fox jumps over the lazy dog” chứa đủ cả 26 chữ cái 🦊", mood: "thinking", choices: [{ label: "Hay ghê!", next: "chat_fact" }, { label: "Đố mình đi", next: "chat_quiz" }] },
    { text: "Fun fact: “goodbye” bắt nguồn từ câu “God be with ye” ngày xưa đó 👋", mood: "news", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: từ “nice” thời Trung cổ từng mang nghĩa “ngốc nghếch” 😂", mood: "cheer", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: “bookkeeper” có 3 cặp chữ đôi liên tiếp: oo-kk-ee 📚", mood: "thinking", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: gần 30% từ vựng tiếng Anh có gốc tiếng Pháp. Restaurant, menu, ballet… 🥐", mood: "news", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: “strengths” dài 9 chữ cái mà chỉ có đúng 1 nguyên âm 💪", mood: "proud", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: chữ “e” là chữ cái xuất hiện nhiều nhất trong tiếng Anh.", mood: "reading", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: ngủ đủ giấc sau khi học giúp não củng cố trí nhớ. Ngủ cũng là học đó 😴", mood: "sleepy", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: mỗi năm có hơn 3 triệu lượt thi IELTS trên khắp thế giới. Bạn không đơn độc đâu!", mood: "cheer", choices: [{ label: "Thêm nữa!", next: "chat_fact" }] },
    { text: "Fun fact: ôn lại cách quãng (spaced repetition) giúp nhớ lâu hơn nhiều so với học dồn một lúc.", mood: "thinking", action: toVocab },
  ],
  chat_cheer: [
    { text: "Bạn không cần giỏi ngay hôm nay. Bạn chỉ cần giỏi hơn hôm qua một chút 💛", mood: "love" },
    { text: "Mỗi từ bạn học hôm nay là một viên gạch cho tấm bằng IELTS sau này 🧱", mood: "proud" },
    { text: "Harry tin bạn. Không phải vì bạn hoàn hảo, mà vì bạn chưa từng bỏ cuộc.", mood: "love" },
    { text: "Học chậm cũng được, miễn là đừng dừng lại. Rùa vẫn về đích mà 🐢", mood: "happy" },
    { text: "Một ngày nào đó bạn sẽ nhìn lại và cảm ơn chính mình của hôm nay đã cố gắng.", mood: "love" },
    { text: "Bạn đã đi được xa hơn bạn nghĩ. Nhìn lại tiến độ mà xem!", mood: "proud", action: toProgress },
    { text: "Khó khăn hôm nay là sức mạnh ngày mai. You've got this, {name}! 💪", mood: "fire" },
    { text: "Sai không sao, sợ sai mới đáng lo. Cứ thử, cứ sai, cứ giỏi lên!", mood: "cheer" },
    { text: "Band mục tiêu của bạn đang chờ ở cuối con đường. Harry sẽ đi cùng bạn tới đó 🚩", mood: "fire" },
  ],
  chat_joke: [
    { text: "Tại sao “dark” viết bằng chữ k? Vì trong bóng tối bạn không thể… “c” (see) được 😎", mood: "cheer", choices: [{ label: "Haha 😂", say: "Hehe, Harry biết mà! Giờ học tiếp nhé 😄", mood: "happy" }, { label: "Thêm cái nữa", next: "chat_joke" }] },
    { text: "Gấu không có răng gọi là gì? A gummy bear! 🐻", mood: "cheer", choices: [{ label: "Haha 😂", say: "Cười một cái là não thả lỏng, học vào hơn đó!", mood: "happy" }, { label: "Thêm cái nữa", next: "chat_joke" }] },
    { text: "Từ nào trong từ điển luôn bị viết sai? Từ “incorrectly” 😆", mood: "cheer", choices: [{ label: "Hiểu rồi 😂", say: "Chơi chữ kiểu IELTS đó, haha!", mood: "happy" }, { label: "Thêm cái nữa", next: "chat_joke" }] },
    { text: "Tại sao sách Toán lúc nào cũng buồn? Vì nó có quá nhiều problems 📘", mood: "cheer", choices: [{ label: "Haha 😂", say: "Còn bạn thì chỉ có solutions thôi nha 😉", mood: "proud" }, { label: "Thêm cái nữa", next: "chat_joke" }] },
    { text: "Harry định kể joke về động từ bất quy tắc, nhưng nó… không theo quy tắc nào cả 🤷", mood: "thinking", choices: [{ label: "😂", say: "Giống như “go – went – gone” vậy đó, chẳng ai hiểu nổi!", mood: "cheer" }, { label: "Thêm cái nữa", next: "chat_joke" }] },
    { text: "Con mèo nói tiếng Anh giỏi không? Nó bảo: “Meow-be!” 🐱", mood: "cheer", choices: [{ label: "Dễ thương 😂", say: "Harry cũng thấy vậy! Giờ mình học tiếp nha.", mood: "love" }, { label: "Thêm cái nữa", next: "chat_joke" }] },
    { text: "Tại sao học sinh mang thang tới trường? Vì muốn lên… high school 🪜", mood: "cheer", choices: [{ label: "Haha 😂", say: "Còn bạn thì muốn lên… high band! 🎯", mood: "fire" }, { label: "Thêm cái nữa", next: "chat_joke" }] },
  ],
  chat_about: [
    { text: "Harry là bạn đồng hành của IeltsWithHarry. Việc của Harry là nhắc bạn học và cổ vũ bạn mỗi ngày!", mood: "wave" },
    { text: "Món Harry thích nhất? Từ vựng mới, ăn mãi không chán 😋", mood: "happy" },
    { text: "Ước mơ của Harry là thấy bạn cầm tấm bằng IELTS đúng band mục tiêu 🎓", mood: "love" },
  ],
  chat_suggest: [
    { text: "Để Harry xem hôm nay bạn đã học gì nhé…", mood: "thinking", action: toLearn },
  ],
  suggest_news: [
    { text: "Hôm nay bạn chưa đọc báo! Một bài tin tức 3 phút là lựa chọn hoàn hảo đó 📰", mood: "news", action: toNews },
  ],
  suggest_vocab: [
    { text: "Ôn từ vựng đi! 10 từ trong 5 phút, nhẹ nhàng mà hiệu quả 📚", mood: "reading", action: toVocab },
    { text: "Kho từ vựng đang đợi bạn ôn đó. Ôn đúng lúc là nhớ cả đời!", mood: "reading", action: toVocab },
  ],
  suggest_lesson: [
    { text: "Tiếp tục lộ trình học nhé! Bài tiếp theo đang chờ bạn 🗺️", mood: "happy", action: toLearn },
  ],
  suggest_listening: [
    { text: "Nghe một bài Listening đi! Tai cần luyện mỗi ngày như cơ bắp vậy 🎧", mood: "happy", action: toListening },
    { text: "Thử luyện nói theo (shadowing) một đoạn ngắn không? Vừa luyện nghe vừa luyện nói luôn.", mood: "thinking", action: toSpeaking },
  ],
  suggest_writing: [
    { text: "Viết một đoạn mở bài Task 2 trong 10 phút thử xem! Viết nhiều mới quen tay ✍️", mood: "reading", action: toWriting },
  ],
  suggest_rest: [
    { text: "Hôm nay bạn học nhiều rồi đó! Gợi ý của Harry là… nghỉ ngơi thật tốt 😴", mood: "sleepy", action: takeBreak },
  ],

  /* ───────── Idle, taps and little extras ───────── */
  idle: [
    { text: "Bạn còn ở đó không? Harry đợi nãy giờ đó 👀", mood: "thinking" },
    { text: "Đang suy nghĩ câu khó hả? Cứ từ từ, không vội đâu.", mood: "love" },
    { text: "Zzz… À không, Harry vẫn thức! Mình học tiếp chứ?", mood: "sleepy" },
    { text: "Kẹt ở đâu à? Harry gợi ý vài thứ nhé.", mood: "thinking", choices: [{ label: "Gợi ý học gì", next: "chat_suggest" }, { label: "Mình ổn mà", say: "Ok! Harry ngồi im cổ vũ thầm 🤫", mood: "happy" }] },
  ],
  idle_long: [
    { text: "Harry ngủ gật mất rồi… Zzz… Gọi Harry khi bạn quay lại nha 😴", mood: "sleepy" },
    { text: "Lâu quá không thấy động tĩnh gì. Nghỉ xong thì quay lại học tiếp nha!", mood: "sleepy" },
  ],
  tap: [
    { text: "Hihi, nhột quá! 😆", mood: "cheer" },
    { text: "Bạn gọi Harry hả? Hôm nay học gì nào?", mood: "wave", choices: menuChoices },
    { text: "Mình tin bạn sẽ đạt band mục tiêu. Thật đó!", mood: "love" },
    { text: "Fun fact: tiếng Anh có hơn 170.000 từ đang dùng, nhưng 3.000 từ phổ biến đã phủ phần lớn văn bản hằng ngày.", mood: "thinking" },
    { text: "Học chậm cũng được, miễn là đừng dừng lại.", mood: "proud" },
    { text: "Câu thần chú hôm nay: “Practice makes progress”, không cần perfect!", mood: "cheer" },
    { text: "Harry đói quá… à không, đói kiến thức thôi 😋", mood: "happy" },
    { text: "High five! ✋ Bạn đang làm rất tốt.", mood: "wave", choices: [{ label: "✋ High five!", say: "Bốp! 🙌 Năng lượng nạp đầy rồi!", mood: "cheer" }] },
    { text: "Bạn biết không? Ngủ đủ giấc giúp ghi nhớ từ vựng tốt hơn đó.", mood: "sleepy" },
    { text: "Đừng so sánh với người khác, hãy so với chính bạn hôm qua.", mood: "love" },
    { text: "Bạn đang học tới đâu rồi {name}?", mood: "thinking", choices: [{ label: "Đang ổn!", say: "Tuyệt! Cứ giữ nhịp này nha 🎵", mood: "happy" }, { label: "Hơi rối", next: "chat_suggest" }] },
    { text: "Harry vừa tập nhảy một điệu mới đó, nhìn nè! 🕺", mood: "cheer" },
    { text: "Có ai khen hôm nay bạn chăm chưa? Chưa thì để Harry khen: bạn chăm lắm! 👏", mood: "proud" },
    { text: "Ê, mình làm một câu đố nhanh không?", mood: "thinking", choices: [{ label: "Chơi!", next: "chat_quiz" }, { label: "Để sau", say: "Ok, khi nào rảnh nhớ gọi Harry nha 😉", mood: "happy" }] },
    { text: "Harry đang nghĩ… nếu bạn học 15 phút mỗi ngày, một năm sẽ là hơn 90 tiếng đó! 🤯", mood: "thinking" },
  ],
  tip: [
    { text: "Mẹo nhỏ: học 15 phút mỗi ngày hiệu quả hơn 2 tiếng mỗi tuần.", mood: "thinking" },
    { text: "Thử shadowing: nghe một câu, dừng lại, nói theo y hệt ngữ điệu.", mood: "happy" },
    { text: "Paraphrase là chìa khóa của IELTS: đề và bài đọc hiếm khi dùng cùng từ.", mood: "reading" },
    { text: "Đặt mục tiêu nhỏ cho hôm nay, ví dụ 10 từ mới. Dễ mà vui!", mood: "proud", choices: goalChoices },
    { text: "Đổi ngôn ngữ điện thoại sang tiếng Anh, bạn sẽ học được từ mới mỗi ngày mà không cần cố.", mood: "thinking" },
    { text: "Nghe podcast tiếng Anh khi đi đường. Thời gian chết thành thời gian học 🎧", mood: "happy" },
    { text: "Viết nhật ký 3 câu tiếng Anh mỗi tối. Đơn giản mà cải thiện Writing rõ rệt!", mood: "reading" },
    { text: "Tự nói chuyện bằng tiếng Anh trong đầu khi làm việc nhà. Nghe hơi lạ nhưng hiệu quả lắm đó 😄", mood: "cheer" },
  ],
  word_of_moment: [
    { text: "Từ của Harry: “resilient” – kiên cường. Giống bạn khi không bỏ học đó 💪", mood: "reading" },
    { text: "Từ hay: “consistent” – đều đặn. Bí quyết band cao nằm ở đây!", mood: "reading" },
    { text: "Collocation xịn: “make progress” chứ không phải “do progress” nha!", mood: "thinking" },
    { text: "Thay “very important” bằng “crucial” hoặc “vital” để Writing ghi điểm hơn.", mood: "proud" },
    { text: "Từ hôm nay: “curious” – tò mò. Tò mò là động cơ học tốt nhất!", mood: "news" },
    { text: "Từ hay: “procrastinate” – trì hoãn. Hôm nay mình đừng procrastinate nha 😉", mood: "worried" },
    { text: "Cụm từ: “a blessing in disguise” – trong cái rủi có cái may.", mood: "love" },
    { text: "Thay “good” bằng “beneficial” khi nói về lợi ích trong Writing nhé!", mood: "proud" },
    { text: "Từ hay: “meticulous” – tỉ mỉ. Đọc đáp án tỉ mỉ là tăng điểm đó!", mood: "reading" },
    { text: "Idiom: “practice makes perfect”. Harry thích phiên bản “practice makes progress” hơn 😄", mood: "cheer" },
    { text: "Từ hay: “thrive” – phát triển mạnh. Bạn đang thrive đó {name}!", mood: "proud" },
    { text: "Cụm Writing hay: “a double-edged sword” – con dao hai lưỡi. Hợp đề Technology lắm!", mood: "thinking" },
  ],
  late_night: [
    { text: "Đã qua nửa đêm rồi {name}! Ngủ đủ giấc mai học mới vào nha 😴", mood: "sleepy", action: goodnight },
    { text: "Khuya lắm rồi đó! Não cần ngủ để lưu những gì bạn vừa học. Good night 🌙", mood: "sleepy", action: goodnight },
  ],
};

/** Fill placeholders; missing values fall back to friendly defaults. */
export function renderLine(text: string, values: Record<string, string | number | undefined>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string, offset: number) => {
    const value = values[key];
    if (value === undefined || value === "") return key === "name" ? (offset === 0 ? "Bạn" : "bạn") : "";
    return String(value);
  });
}

/** Special days by "MM-DD". */
export const specialDays: Record<string, CompanionTrigger> = {
  "01-01": "day_new_year",
  "02-14": "day_valentine",
  "03-08": "day_women",
  "06-01": "day_children",
  "10-20": "day_women",
  "10-31": "day_halloween",
  "11-20": "day_teacher",
  "12-24": "day_christmas",
  "12-25": "day_christmas",
};

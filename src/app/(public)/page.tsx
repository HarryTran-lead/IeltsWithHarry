import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Check, Headphones, NotebookPen, Newspaper, UsersRound, Volume2 } from "lucide-react";
import { Doodle, Sticker, Tape, type StickerName } from "@/components/stickers/stickers";
import { stages, vocabulary } from "@/lib/demo-data";
import { getViewerRole } from "@/lib/viewer-role";

const skills: { name: string; sticker: StickerName; text: string; tone: string }[] = [
  { name: "Vocabulary", sticker: "abc", text: "Gặp từ trong ngữ cảnh bài mới, tra nghĩa và xây kho từ của riêng bạn.", tone: "mint" },
  { name: "Grammar", sticker: "pencil", text: "Nhận diện cấu trúc trong câu thật, bắt đầu với các từ nối thường dùng.", tone: "sky" },
  { name: "Reading", sticker: "book", text: "Đọc bài toàn văn có nguồn rõ ràng và luyện theo dạng câu hỏi IELTS.", tone: "coral" },
  { name: "Listening", sticker: "headphones", text: "Nghe bản ghi tiếng Anh từ kho âm thanh công cộng và ghi ý chính.", tone: "teal" },
  { name: "Writing", sticker: "chart", text: "Luyện Academic Task 1 bằng số liệu thật và Task 2 theo chủ đề thời sự.", tone: "sun" },
  { name: "Speaking", sticker: "mic", text: "Chuẩn bị ý, bấm giờ và ghi âm với cue card từ các chủ đề đang diễn ra.", tone: "lavender" },
];

const stageStickers: StickerName[] = ["abc", "pencil", "book", "headphones", "chart", "rocket", "star"];

export default async function GuestHome() {
  const role = await getViewerRole();
  if (role === "student") redirect("/app/dashboard");
  if (role === "admin") redirect("/admin");
  const word = vocabulary[0];
  return <div className="guest-home">
    <section className="guest-hero">
      <div className="guest-hero-copy">
        <span className="guest-pill"><i aria-hidden="true" /> IELTSWITHHARRY · HỌC MIỄN PHÍ</span>
        <h1>Học tiếng Anh, ghi lại <span className="hl">từng bước tiến</span> của bạn.</h1>
        <p>Khám phá lộ trình từ nền tảng đến IELTS, luyện sáu kỹ năng bằng bài học soạn sẵn và giữ từ mới, ghi chú, lịch sử học trong một cuốn sổ tay.</p>
        <div className="guest-actions">
          <Link href="/register" className="button primary">Bắt đầu học <ArrowRight size={17} /></Link>
          <Link href="/courses" className="button subtle">Xem lộ trình</Link>
        </div>
        <small>Khách có thể xem khóa học. Đăng nhập để luyện tập và lưu tiến độ.</small>
        <dl className="guest-facts">
          <div><dt>7</dt><dd>chặng học, band 1.0 → 7.0+</dd></div>
          <div><dt>6</dt><dd>kỹ năng IELTS trong một nơi</dd></div>
          <div><dt>1</dt><dd>sổ tay cho mọi ghi chú</dd></div>
        </dl>
      </div>
      <div className="guest-board" aria-hidden="true">
        <div className="board-card board-word">
          <Tape tone="teal" />
          <span className="board-label">WORD CARD</span>
          <strong>{word.word}</strong>
          <span className="board-phonetic"><Volume2 size={15} /> {word.phonetic}</span>
          <p><b>{word.meaning}</b> · {word.definition}</p>
          <em>“{word.example}”</em>
        </div>
        <div className="board-card board-plan">
          <Tape tone="sun" />
          <span className="board-label"><CalendarDays size={14} /> HÔM NAY</span>
          <ul>
            <li className="done"><i><Check size={11} strokeWidth={4} /></i> Vocabulary · 5 từ mới</li>
            <li className="done"><i><Check size={11} strokeWidth={4} /></i> Reading passage</li>
            <li><i /> Speaking · Part 2</li>
          </ul>
        </div>
        <Sticker name="harry" size={150} tilt={-5} float className="board-harry" />
        <Sticker name="bubble" label="Hello!" size={96} tilt={9} delay={200} className="board-bubble" />
        <Sticker name="star" label="7.0+" size={74} tilt={-12} delay={320} float className="board-star" />
        <Sticker name="plane" size={70} tilt={6} delay={420} className="board-plane" />
        <Sticker name="headphones" size={60} tilt={-14} delay={520} className="board-headphones" />
        <Doodle name="swirl" className="board-swirl" />
      </div>
    </section>

    <section className="guest-section reveal">
      <div className="guest-section-head">
        <div>
          <span className="eyebrow">SÁU KỸ NĂNG</span>
          <h2>Mỗi kỹ năng một góc luyện tập riêng</h2>
        </div>
        <p>Bài luyện được dựng từ nội dung có nguồn rõ ràng và đáp án xác định, để bạn biết mình đúng ở đâu và sai vì sao.</p>
      </div>
      <div className="guest-skills">
        {skills.map((skill, index) => <article key={skill.name} className={`guest-skill tone-${skill.tone} lift`}>
          <Sticker name={skill.sticker} size={58} tilt={index % 2 ? 8 : -8} pop={false} />
          <h3>{skill.name}</h3>
          <p>{skill.text}</p>
        </article>)}
      </div>
    </section>

    <section className="guest-section guest-roadmap reveal">
      <div className="guest-section-head">
        <div>
          <span className="eyebrow">LỘ TRÌNH</span>
          <h2>Bảy chặng, từ những từ đầu tiên đến IELTS tự tin</h2>
        </div>
        <Link href="/courses" className="button subtle">Xem chi tiết lộ trình <ArrowRight size={16} /></Link>
      </div>
      <ol className="roadmap-track">
        {stages.map((stage, index) => <li key={stage.id}>
          <Link href={`/courses/${stage.id}`} className="roadmap-stop">
            <Sticker name={stageStickers[index]} size={44} tilt={index % 2 ? 8 : -8} pop={false} />
            <span className="roadmap-band">{stage.range}</span>
            <strong>{stage.name}</strong>
            <small>{stage.description}</small>
          </Link>
        </li>)}
      </ol>
      <p className="guest-footnote">Các chặng là mốc định hướng, không phải điểm IELTS chính thức.</p>
    </section>

    <section className="guest-section reveal">
      <div className="guest-section-head">
        <div>
          <span className="eyebrow">CÔNG CỤ HỌC</span>
          <h2>Mọi thứ cần cho một buổi học, ở cùng một chỗ</h2>
        </div>
      </div>
      <div className="guest-tools">
        <article className="guest-tool tool-news lift">
          <div className="guest-tool-icon"><Newspaper size={20} /></div>
          <h3>Daily News</h3>
          <p>Tin tiếng Anh mới mỗi ngày từ NASA, NOAA và NSF, kèm bài đọc và câu hỏi theo dạng IELTS.</p>
          <div className="tool-news-preview" aria-hidden="true">
            <span>Tin hôm nay</span>
            <i /><i /><i />
            <b>Câu hỏi IELTS · có đáp án</b>
          </div>
          <Sticker name="globe" size={84} tilt={-8} pop={false} className="guest-tool-sticker" />
        </article>
        <article className="guest-tool tool-room lift">
          <div className="guest-tool-icon"><UsersRound size={20} /></div>
          <h3>Cùng học</h3>
          <p>Phòng học chung với đồng hồ tập trung, nhạc lofi và chat trực tiếp với người đang học.</p>
          <Sticker name="clock" size={64} tilt={8} pop={false} className="guest-tool-sticker" />
        </article>
        <article className="guest-tool tool-notebook lift">
          <div className="guest-tool-icon"><NotebookPen size={20} /></div>
          <h3>Sổ tay</h3>
          <p>Nút nổi ghi nhanh từ mọi trang; ghi chú, từ mới và lịch sử học nằm trên một dòng thời gian.</p>
          <Sticker name="notebook" size={64} tilt={-6} pop={false} className="guest-tool-sticker" />
        </article>
        <article className="guest-tool tool-planner lift">
          <div className="guest-tool-icon"><CalendarDays size={20} /></div>
          <h3>Planner</h3>
          <p>Đặt mục tiêu mỗi ngày, sắp xếp việc cần làm và đánh dấu từng bước đã xong.</p>
          <Sticker name="calendar" size={64} tilt={8} pop={false} className="guest-tool-sticker" />
        </article>
        <article className="guest-tool tool-listen lift">
          <div className="guest-tool-icon"><Headphones size={20} /></div>
          <h3>Nghe & nói</h3>
          <p>Nghe bản ghi có transcript, ghi âm câu trả lời Speaking và tự nghe lại ngay trên trình duyệt.</p>
          <Sticker name="mic" size={64} tilt={-8} pop={false} className="guest-tool-sticker" />
        </article>
      </div>
    </section>

    <section className="guest-section guest-steps reveal">
      <div className="guest-section-head">
        <div>
          <span className="eyebrow">BẮT ĐẦU TỪ ĐÂU?</span>
          <h2>Ba bước nhỏ cho hôm nay</h2>
        </div>
      </div>
      <ol>
        <li><span>1</span><h3>Tạo tài khoản</h3><p>Miễn phí. Tiến độ, sổ tay và kế hoạch học được lưu theo tài khoản của bạn.</p></li>
        <li><Doodle name="arrow" className="step-arrow" /><span>2</span><h3>Chọn chặng phù hợp</h3><p>Bắt đầu ở chặng bạn thấy thoải mái, xem trước bài mẫu của từng kỹ năng.</p></li>
        <li><Doodle name="arrow" className="step-arrow" /><span>3</span><h3>Luyện & ghi lại</h3><p>Làm bài có đáp án, lưu từ mới vào sổ tay và đánh dấu việc đã xong trong planner.</p></li>
      </ol>
    </section>

    <section className="guest-cta reveal">
      <Tape tone="coral" />
      <div>
        <span className="hand-note">Small steps. Big progress!</span>
        <h2>Chọn một bước nhỏ hôm nay</h2>
        <p>Khám phá bảy chặng học và các bài mẫu trước khi tạo tài khoản.</p>
        <div className="guest-actions">
          <Link href="/register" className="button primary">Bắt đầu học <ArrowRight size={17} /></Link>
          <Link href="/courses" className="button subtle">Khám phá khóa học</Link>
        </div>
      </div>
      <div className="guest-cta-art" aria-hidden="true">
        <Sticker name="harry" size={128} tilt={6} pop={false} />
        <Sticker name="heart" size={54} tilt={-12} pop={false} />
        <Sticker name="stamp" label="A+" size={70} tilt={10} pop={false} />
      </div>
    </section>
  </div>;
}

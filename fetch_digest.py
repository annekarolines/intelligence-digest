#!/usr/bin/env python3
"""
Intelligence Digest — Coleta diária do Social Media Today
Fonte: Google News RSS (Social Media Today bloqueia acesso direto).
Os links redirecionam para o artigo original ao clicar.
"""

import os
import json
import hashlib
import time
import feedparser
import google.generativeai as genai
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.5-flash")  # Modelo disponível nesta conta

REQUEST_DELAY = 5  # segundos entre chamadas (free tier gemini-2.5-flash: 20 RPM)

# --- Configurações ---

# Google News RSS filtrando apenas artigos do Social Media Today
RSS_URL = (
    "https://news.google.com/rss/search"
    "?q=site:socialmediatoday.com"
    "&hl=en-US&gl=US&ceid=US:en"
)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DATA_FILE = os.path.join(DATA_DIR, "articles.json")
MAX_AGE_DAYS = 90  # Apenas artigos dos últimos 3 meses

SYSTEM_PROMPT = """Você é um analista de inteligência especializado em marketing digital.
Você apoia uma diretora de inteligência de agência que precisa de análises estratégicas sobre:
- Redes sociais: algoritmos, funcionalidades, tendências, estratégias de plataformas
- Inteligência Artificial: ferramentas para marketing, automação, IA generativa
- Comportamento do consumidor digital: tendências, dados, mudanças de hábito
- Dados e métricas: KPIs, benchmarks, mensuração de resultados
- Estratégia e tendências para agências de comunicação

Responda sempre em Português do Brasil, de forma objetiva e estratégica."""

ANALYSIS_PROMPT = """Analise este título de artigo do Social Media Today e retorne um JSON válido.
Use seu conhecimento sobre o tema para produzir análise estratégica relevante.

Estrutura exata do JSON:
{{
  "relevante": true,
  "categoria": "IA",
  "titulo_pt": "título traduzido em português",
  "resumo": "2 a 3 frases estratégicas sobre o que esse tema significa para agências",
  "insights_chave": ["insight 1", "insight 2", "insight 3"],
  "pontos_acionaveis": ["ação concreta 1", "ação concreta 2"],
  "score_relevancia": 8
}}

Regras:
- "relevante": true se o tema for redes sociais, IA em marketing, comportamento digital, dados/métricas, tendências para agências. false caso contrário.
- "categoria": exatamente uma de: "IA" | "Redes Sociais" | "Comportamento" | "Estratégia" | "Dados & Métricas"
- "titulo_pt": tradução natural do título (não literal se não soar bem em português)
- "resumo": direto ao ponto, focado nas implicações para o trabalho de agência
- "insights_chave": 3 pontos concretos e específicos ao tema do artigo
- "pontos_acionaveis": 2 ações práticas que a agência pode adotar a partir dessa informação
- "score_relevancia": 1-10 (10 = crítico para o trabalho da agência)

Título do artigo: {title}
Data de publicação: {date}

Responda APENAS com o JSON, sem texto adicional, sem blocos de código."""


# --- Helpers ---

def load_existing_data():
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"last_updated": None, "articles": []}


def save_data(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def article_id(url):
    return hashlib.md5(url.encode()).hexdigest()


def clean_title(title):
    """Remove sufixo '- Social Media Today' do título."""
    suffixes = [" - Social Media Today", " | Social Media Today"]
    for suffix in suffixes:
        if title.endswith(suffix):
            return title[: -len(suffix)].strip()
    return title.strip()


def parse_date(entry):
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        try:
            return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        except Exception:
            pass
    return None


def analyze_with_gemini(title, date_str, retries=3):
    """Usa Gemini para analisar relevância e gerar resumo em português."""
    full_prompt = SYSTEM_PROMPT + "\n\n" + ANALYSIS_PROMPT.format(title=title, date=date_str)

    for attempt in range(retries):
        try:
            response = model.generate_content(
                full_prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    max_output_tokens=2000,
                    temperature=0.3,
                ),
            )
            text = response.text.strip()
            # Remove blocos de código markdown se presentes
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
            if not text.startswith("{"):
                start = text.find("{")
                if start >= 0:
                    text = text[start:]
            return json.loads(text)

        except Exception as e:
            err = str(e)
            # Extrai tempo de retry sugerido pela API (ex: "retry in 44s")
            wait = REQUEST_DELAY
            if "retry_delay" in err or "Please retry in" in err:
                import re
                m = re.search(r"retry in (\d+)", err)
                wait = int(m.group(1)) + 2 if m else 60
            if attempt < retries - 1 and ("429" in err or "ResourceExhausted" in err):
                print(f"           → Rate limit, aguardando {wait}s...")
                time.sleep(wait)
                continue
            raise


# --- Main ---

def run():
    print(f"\n{'='*60}")
    print(f"Intelligence Digest — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print(f"{'='*60}\n")

    existing_data = load_existing_data()
    existing_ids = {a["id"] for a in existing_data.get("articles", [])}
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)

    print("1. Buscando artigos do Google News (Social Media Today)...")
    feed = feedparser.parse(RSS_URL)

    if not feed.entries:
        print("ERRO: Nenhum artigo encontrado.")
        return

    print(f"   {len(feed.entries)} artigos encontrados no feed\n")

    # Filtra: apenas SMT, dentro dos últimos 90 dias, não processados ainda
    new_entries = []
    for entry in feed.entries:
        # Garante que é do Social Media Today
        source = getattr(entry, "source", {})
        if isinstance(source, dict) and "socialmediatoday" not in source.get("href", ""):
            continue

        url = getattr(entry, "link", "")
        if not url:
            continue
        if article_id(url) in existing_ids:
            continue

        pub_date = parse_date(entry)
        if pub_date and pub_date >= cutoff_date:
            new_entries.append((entry, pub_date))

    print(f"   {len(new_entries)} artigos novos para processar\n")

    if not new_entries:
        print("Nenhum artigo novo. Atualizando timestamp...")
        existing_data["last_updated"] = datetime.now(timezone.utc).isoformat()
        save_data(existing_data)
        return

    print("2. Analisando artigos com Gemini...\n")
    new_articles = []

    for i, (entry, pub_date) in enumerate(new_entries):
        raw_title = getattr(entry, "title", "Sem título")
        title = clean_title(raw_title)
        url = entry.link
        date_str = pub_date.strftime("%Y-%m-%d")

        print(f"   [{i+1}/{len(new_entries)}] {title[:65]}...")

        if i > 0:
            time.sleep(REQUEST_DELAY)  # respeita rate limit do free tier

        try:
            analysis = analyze_with_gemini(title, date_str)

            if not analysis.get("relevante", False):
                print(f"           → Não relevante, ignorando\n")
                continue

            score = analysis.get("score_relevancia", 0)
            if score < 5:
                print(f"           → Score baixo ({score}/10), ignorando\n")
                continue

            article = {
                "id": article_id(url),
                "title": title,
                "title_pt": analysis.get("titulo_pt", title),
                "url": url,
                "date": date_str,
                "category": analysis.get("categoria", "Estratégia"),
                "summary": analysis.get("resumo", ""),
                "key_insights": analysis.get("insights_chave", [])[:3],
                "actionable_points": analysis.get("pontos_acionaveis", [])[:2],
                "relevance_score": score,
            }
            new_articles.append(article)
            print(f"           → {article['category']} | Score: {score}/10\n")

        except (json.JSONDecodeError, KeyError, Exception) as e:
            print(f"           → Erro: {e}\n")
            continue

    # Mantém artigos existentes ainda dentro do prazo
    kept = [
        a for a in existing_data.get("articles", [])
        if a.get("date", "") >= cutoff_date.strftime("%Y-%m-%d")
    ]

    # Novos no topo, ordenados por data
    all_articles = new_articles + kept
    all_articles.sort(key=lambda a: a["date"], reverse=True)

    result = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "articles": all_articles
    }

    save_data(result)

    print(f"\n{'='*60}")
    print(f"Concluído! {len(new_articles)} artigos novos adicionados.")
    print(f"Total no digest: {len(all_articles)} artigos")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    run()

FROM ubuntu:24.04

ARG NODE_MAJOR=22

ENV DEBIAN_FRONTEND=noninteractive

# ===== 基本ツール =====
RUN apt-get update && apt-get install -y \
    bash \
    ca-certificates \
    curl \
    git \
    gnupg \
    sudo \
    build-essential \
    less \
    nano \
    procps \
    iproute2 \
    iputils-ping \
    net-tools \
    openssh-client \
    locales \
    language-pack-ja \
    vim \
    && rm -rf /var/lib/apt/lists/*

RUN locale-gen ja_JP.UTF-8 \
    && update-locale LANG=ja_JP.UTF-8 LC_ALL=ja_JP.UTF-8

# ===== sudo =====
RUN echo "ubuntu ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# ===== lazygit =====
RUN LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": *"v\K[^"]*') \
    && curl -Lo /tmp/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz" \
    && tar xf /tmp/lazygit.tar.gz -C /tmp lazygit \
    && install /tmp/lazygit -D -t /usr/local/bin/ \
    && rm -f /tmp/lazygit /tmp/lazygit.tar.gz

# ===== Node (codex用) =====
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ===== pnpm =====
RUN corepack enable \
    && corepack prepare pnpm@latest --activate

# ===== uv（Python管理はしない、依存だけ） =====
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && cp /root/.local/bin/uv /usr/local/bin/uv \
    && cp /root/.local/bin/uvx /usr/local/bin/uvx

# ===== mise（ランタイム管理の本体） =====
RUN curl https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh
RUN echo 'eval "$(mise activate bash --shims)"' >> /home/ubuntu/.bash_profile \
    && echo 'eval "$(mise activate bash)"' >> /home/ubuntu/.bashrc \
    && chown ubuntu:ubuntu /home/ubuntu/.bash_profile /home/ubuntu/.bashrc

# ===== just =====
ARG JUST_VERSION=1.39.0
RUN curl -fsSL -o /tmp/just.tar.gz \
      https://github.com/casey/just/releases/download/${JUST_VERSION}/just-${JUST_VERSION}-x86_64-unknown-linux-musl.tar.gz \
    && tar -xzf /tmp/just.tar.gz -C /tmp \
    && mv /tmp/just /usr/local/bin/just \
    && chmod +x /usr/local/bin/just \
    && rm -f /tmp/just.tar.gz

# ===== codex =====
RUN npm install -g @openai/codex @fclef819/cdx

# ===== 環境変数 =====
ENV PNPM_HOME=/home/ubuntu/.local/share/pnpm
ENV LANG=ja_JP.UTF-8
ENV LANGUAGE=ja_JP:ja
ENV LC_ALL=ja_JP.UTF-8
ENV PATH=${PNPM_HOME}:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin

# ===== 作業ディレクトリ =====
RUN mkdir -p /workspace/mcpfleet \
    && mkdir -p /home/ubuntu/.ssh \
    && mkdir -p /home/ubuntu/.codex \
    && mkdir -p /home/ubuntu/.local/share/pnpm/store \
    && chown -R ubuntu:ubuntu /workspace /home/ubuntu \
    && chmod 700 /home/ubuntu/.ssh

WORKDIR /workspace/mcpfleet
USER ubuntu

CMD ["bash"]

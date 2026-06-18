---
title: "Substituindo Docker Desktop por Colima no macOS: guia DevOps para máxima eficiência e mínimo uso de disco"
summary: "Um guia técnico avançado para trocar Docker Desktop por Colima no macOS, reduzindo overhead de CPU, memória e armazenamento com Lima, Virtualization.framework, QEMU, BuildKit e rotinas rigorosas de limpeza."
author: "Guilherme Portella"
publishedAt: "2026-06-17"
tags: ["DevOps", "Docker", "Colima", "macOS", "Performance"]
---

## Premissa operacional

Este guia parte de uma hipótese explícita: o ambiente local deve executar containers Docker no macOS com a menor superfície operacional possível. Isso significa instalar somente a CLI do Docker, delegar o daemon Linux ao Colima, limitar CPU/memória/disco desde a criação da VM, evitar componentes de produto que não são necessários para desenvolvimento local e manter uma disciplina agressiva de limpeza de imagens, volumes e cache de build.

O objetivo não é reproduzir todos os recursos do Docker Desktop. O objetivo é construir um ambiente previsível, barato em recursos, simples de destruir e recriar, e suficientemente compatível com a maioria dos fluxos de desenvolvimento baseados em `docker build`, `docker run` e `docker compose`.

> Em macOS, containers Linux não executam diretamente sobre o kernel Darwin/XNU. Eles precisam de uma VM Linux porque dependem de primitivas do kernel Linux, como namespaces, cgroups, overlay filesystems, netfilter e semânticas específicas de `/proc`, `/sys` e sockets Unix.

## 1. Fundamentação Teórica e Justificativa Científica

### 1.1. Arquitetura: Docker Desktop versus Colima

No Linux nativo, a cadeia típica é curta:

```text
docker CLI -> dockerd/containerd -> runc -> kernel Linux
```

No macOS, existe uma camada inevitável de virtualização:

```text
docker CLI no macOS -> socket/API -> daemon Docker dentro de uma VM Linux -> kernel Linux da VM
```

A diferença entre Docker Desktop e Colima está em como essa VM é empacotada, governada, atualizada, configurada e integrada ao host.

### 1.2. Docker Desktop no macOS

Docker Desktop é um produto completo. Ele inclui GUI, integração com login, atualização, extensões, Kubernetes opcional, gerenciamento gráfico de imagens e containers, helpers de credenciais, integração com IDEs, mecanismos de file sharing e uma VM Linux gerenciada pelo próprio Docker Desktop.

Em versões modernas para macOS, Docker Desktop pode usar diferentes Virtual Machine Managers:

| VMM | Situação técnica | Observação |
| :-- | :-- | :-- |
| Docker VMM | opção moderna do Docker Desktop, especialmente em Apple Silicon | integrações próprias do produto Docker |
| Apple Virtualization.framework | opção madura e nativa do macOS | usa APIs de virtualização da Apple |
| QEMU | legado em Docker Desktop para Apple Silicon | mantido para compatibilidade antiga |
| HyperKit | legado em Macs Intel | baseado em Hypervisor.framework e hoje tratado como legado |

A pilha fica conceitualmente assim:

```text
macOS
  Docker Desktop.app
    GUI, update agent, integrations, settings, optional Kubernetes
    VMM: Docker VMM / Virtualization.framework / QEMU legacy / HyperKit legacy
      LinuxKit VM
        dockerd
        containerd
        runc
        overlay2
        /var/lib/docker
```

Essa abordagem é conveniente e integrada, mas tem uma superfície maior do que a necessária para equipes que querem apenas um daemon Docker local. Mesmo em repouso, há mais processos, configurações e pontos de estado do produto. Para máquinas com SSD limitado, 8 GB ou 16 GB de RAM, ou múltiplos projetos com imagens grandes, essa diferença se torna material.

### 1.3. Colima, Lima, QEMU e Virtualization.framework

Colima é uma camada de experiência sobre Lima. Lima fornece VMs Linux no macOS e Linux; Colima configura essa VM para rodar runtimes de containers como Docker, containerd ou Incus. Na configuração mais comum para desenvolvedores Docker:

```text
macOS
  docker CLI instalada via Homebrew
  colima CLI
    Lima VM
      VMM: vz ou qemu
      Linux guest
        dockerd
        containerd
        runc
        overlay2
        /var/lib/docker
```

O Colima reduz a superfície operacional porque não instala o produto Docker Desktop. A UI desaparece, o daemon continua existindo dentro de uma VM Linux, e a CLI conversa com esse daemon por um Docker context e por um socket Unix criado pelo Colima.

Os dois `vm-type` mais importantes são:

| `--vm-type` | Base | Quando usar | Trade-off |
| :-- | :-- | :-- | :-- |
| `vz` | Apple Virtualization.framework | macOS recente, arquitetura nativa, prioridade para eficiência | melhor integração com host, boa escolha padrão em Apple Silicon e macOS moderno |
| `qemu` | QEMU | compatibilidade, VMs de arquitetura estrangeira, cenários específicos | maior flexibilidade, mas pode consumir mais CPU, especialmente em emulação completa |

Em Apple Silicon, a combinação mais eficiente para a maioria dos projetos é:

```text
VM ARM64/aarch64 + vm-type vz + mount-type virtiofs
```

Para executar imagens `linux/amd64` em Apple Silicon, existem três possibilidades:

| Estratégia | Exemplo | Custo |
| :-- | :-- | :-- |
| Preferir imagem multi-arch | `docker pull postgres:16` em VM `aarch64` | menor custo se a imagem publica ARM64 |
| Usar Rosetta para userspace amd64 | `--vm-type vz --arch aarch64 --vz-rosetta` | custo moderado, útil para binários x86_64 dentro de uma VM ARM64 |
| Emular VM Intel completa | `--vm-type qemu --arch x86_64` | custo alto de CPU e I/O, usar somente quando indispensável |

### 1.4. O problema do disco virtual no Docker Desktop

Docker Desktop armazena containers e imagens Linux dentro de um arquivo grande de disco virtual no filesystem do macOS. Em instalações tradicionais, esse arquivo aparece como `Docker.raw` ou `Docker.qcow2`, em caminhos como:

```bash
~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw
~/.docker/desktop/vms/0/data/Docker.raw
```

Para localizar em uma máquina real:

```bash
find "$HOME/Library/Containers/com.docker.docker" "$HOME/.docker/desktop" \
  \( -name 'Docker.raw' -o -name 'Docker.qcow2' \) \
  -print 2>/dev/null
```

O host enxerga um grande arquivo esparso. A VM enxerga um disco Linux. Dentro dele, o Docker grava:

```text
/var/lib/docker/
  overlay2/        camadas copy-on-write
  image/           metadados de imagens
  containers/      metadados, logs json-file, estado
  volumes/         volumes locais
  buildkit/        cache do BuildKit
  containerd/      content store
```

O problema clássico de `disk bloat` aparece porque há duas camadas de alocação:

```text
APFS no macOS
  arquivo Docker.raw ou disco Lima
    filesystem Linux da VM
      overlay2 / volumes / build cache / logs
```

Quando um container cria e apaga arquivos, a liberação acontece primeiro dentro do filesystem Linux da VM. O APFS só recupera espaço se a camada de virtualização receber e propagar corretamente operações como discard/TRIM/hole punching ou se o produto executar uma rotina explícita de recuperação. Portanto, "apaguei arquivos dentro do container" não implica "o macOS recuperou espaço imediatamente".

A equação prática é:

```text
espaço_host_real ~= blocos_do_disco_virtual_ja_alocados_no_APFS
espaço_guest_usado ~= blocos_ocupados_no_filesystem_Linux
diferença          ~= blocos_livres_no_guest_que_o_host_ainda_nao_reclamou
```

Além disso, Docker cria muitos objetos pequenos: layers, whiteouts do overlayfs, blobs content-addressed, snapshots, caches de build, índices e logs. Essa granularidade favorece fragmentação interna no guest e crescimento progressivo do arquivo virtual no host. O arquivo pode até ser esparso e ter limite máximo maior que o espaço real consumido, mas o comportamento operacional sob churn é de crescimento até que uma rotina de prune/reclaim/reset seja executada.

O Docker Desktop possui mecanismos de limpeza e recuperação, mas o modelo continua concentrando muito estado em um disco grande gerenciado pelo produto. Reduzir o tamanho máximo pelo painel pode apagar o disco atual e perder imagens/containers. Isso torna a limpeza menos transparente do que em um fluxo intencionalmente descartável.

### 1.5. Por que Colima reduz o risco de bloat

Colima não elimina a VM. Nenhuma solução Docker em macOS elimina a necessidade de uma VM Linux para containers Linux. O ganho é de governança:

1. A VM é explícita.
2. O tamanho de disco é definido na criação com `--disk`.
3. O perfil pode ser destruído com `colima delete --data`.
4. A configuração fica em `~/.colima`.
5. O Docker Desktop inteiro deixa de existir como dependência.
6. O contexto Docker aponta para um socket claro, normalmente `~/.colima/default/docker.sock`.

Em termos de engenharia de capacidade, isso muda o modelo mental:

```text
Docker Desktop:
  produto grande + VM gerenciada + disco virtual frequentemente invisível

Colima:
  CLI pequena + VM declarativa + limite explícito + destruição/recriação barata
```

### 1.6. Benefícios científicos da abordagem minimalista

#### CPU

CPU em ambiente local sofre principalmente por:

- daemon e processos auxiliares em background;
- emulação de arquitetura estrangeira;
- file sharing com alto volume de metadados;
- builds que invalidam cache cedo demais;
- containers sem limite de CPU.

Com Colima, o limite de vCPU é explícito:

```bash
colima start --cpu 2
```

Isso cria uma fronteira clara entre scheduler do host e workloads da VM. Um build paralelo dentro da VM não deve consumir todos os núcleos físicos do Mac se a VM só expõe 2 vCPUs.

Modelo simplificado:

```text
CPU_host_consumida ~= min(vCPU_colima, paralelismo_do_workload) + overhead_virtualizacao + overhead_file_sharing
```

Ao reduzir `vCPU_colima`, reduzimos a amplitude máxima do impacto local. Ao usar `--vm-type vz` em arquitetura nativa, reduzimos overhead em comparação com emulação completa.

#### Memória

Memória em Docker local é composta por:

- memória residente do daemon Docker;
- memória dos containers;
- page cache do Linux guest;
- buffers de rede e filesystem;
- processos auxiliares do ambiente de virtualização;
- memória da UI e serviços do produto, se Docker Desktop estiver instalado.

Com Colima:

```bash
colima start --memory 4
```

O limite da VM funciona como envelope operacional. Dentro da VM, o Linux ainda usa page cache agressivamente, mas esse cache fica contido pelo tamanho da VM. Em notebooks com pouca RAM, isso evita que um conjunto de containers pressione o macOS de forma ilimitada.

Modelo simplificado:

```text
M_total_colima ~= M_vm_guest + M_vmm + M_cli
M_vm_guest     = containers + dockerd + containerd + page_cache + kernel_guest
```

Uma VM de 4 GiB com containers bem configurados é mais previsível do que um ambiente sem limite consciente. O limite reduz throughput máximo em builds pesados, mas melhora interatividade do sistema e evita paginação excessiva do macOS.

#### Armazenamento

O disco é onde a abordagem minimalista mais aparece. O padrão do Colima costuma ser generoso para conveniência. Para economia extrema, o limite deve ser menor:

```bash
colima start --disk 24
```

`--disk` define o tamanho do disco de dados da VM em GiB. O número ideal depende do tipo de projeto:

| Perfil | CPU | Memória | Disco | Uso |
| :-- | --: | --: | --: | :-- |
| mínimo agressivo | 2 | 3 GiB | 16 GiB | APIs pequenas, Go, Node leve, imagens slim |
| equilibrado | 2 | 4 GiB | 24 GiB | maioria dos projetos web/back-end |
| pesado controlado | 4 | 6 GiB | 32 GiB | monorepos, bancos locais, builds frequentes |
| exceção temporária | 6+ | 8+ GiB | 48+ GiB | stacks com muitas imagens, Android, ML, Kafka local |

A tese é simples: se o disco virtual tem limite de 24 GiB, o ambiente não pode crescer silenciosamente para 80 GiB. Ele falhará antes, e essa falha é um sinal operacional útil: imagem grande demais, volume persistente indevido, cache não podado ou Dockerfile ineficiente.

## 2. Guia de Instalação Passo a Passo (Zero Bloatware)

### 2.1. Remover a dependência mental do Docker Desktop

Não instale o Cask do Docker:

```bash
# Evite este comando para o padrão enxuto deste guia:
brew install --cask docker
```

O Cask instala o Docker Desktop completo:

- `Docker.app`;
- VM e disco gerenciados pelo produto;
- GUI;
- serviços auxiliares;
- atualizações e integrações próprias;
- Kubernetes opcional;
- extensões e componentes que podem ser desnecessários para a equipe.

Para um ambiente local minimalista, instale apenas a CLI e o runtime provider:

```bash
brew install docker colima
```

Verifique as versões:

```bash
docker version --client
colima version
```

Se o projeto exigir `docker compose` e a fórmula `docker` instalada no seu Mac não fornecer o plugin Compose, adicione somente o plugin, ainda sem Docker Desktop:

```bash
brew install docker-compose
mkdir -p ~/.docker/cli-plugins
ln -sfn "$(brew --prefix)/opt/docker-compose/bin/docker-compose" \
  ~/.docker/cli-plugins/docker-compose
docker compose version
```

### 2.2. Limpeza prévia opcional do Docker Desktop

Se Docker Desktop já estava instalado, primeiro exporte ou descarte conscientemente o que precisa ser preservado. Volumes de banco de dados e imagens locais podem conter estado importante.

Listar o que existe antes de remover:

```bash
docker context ls
docker system df -v
docker image ls
docker container ls -a
docker volume ls
```

Exemplo de backup de um volume nomeado:

```bash
docker run --rm \
  -v nome_do_volume:/data:ro \
  -v "$PWD":/backup \
  alpine:3.20 \
  tar czf /backup/nome_do_volume.tgz -C /data .
```

Remover o Cask, se ele foi instalado via Homebrew:

```bash
brew uninstall --cask docker
```

Remover arquivos restantes deve ser feito com cuidado. Primeiro localize:

```bash
find "$HOME/Library/Containers" "$HOME/Library/Group Containers" "$HOME/.docker" \
  -maxdepth 4 \
  \( -iname '*docker*' -o -name 'Docker.raw' -o -name 'Docker.qcow2' \) \
  -print 2>/dev/null
```

Só apague dados antigos depois de confirmar que nada precisa ser preservado.

### 2.3. Escolher arquitetura corretamente

Colima usa `aarch64` para Apple Silicon e `x86_64` para Intel. O `uname -m` do macOS retorna `arm64` em Apple Silicon, então converta explicitamente:

```bash
case "$(uname -m)" in
  arm64)  COLIMA_ARCH="aarch64" ;;
  x86_64) COLIMA_ARCH="x86_64" ;;
  *)      echo "Arquitetura nao suportada: $(uname -m)" >&2; exit 1 ;;
esac

echo "$COLIMA_ARCH"
```

### 2.4. Inicialização recomendada para Apple Silicon

Perfil enxuto e prático para M1/M2/M3/M4:

```bash
colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch aarch64 \
  --vm-type vz \
  --mount-type virtiofs \
  --activate
```

Explicação das flags:

| Flag | Valor recomendado | Função | Por que importa |
| :-- | :-- | :-- | :-- |
| `--runtime docker` | `docker` | instala e inicia Docker Engine na VM | mantém compatibilidade com CLI Docker |
| `--cpu` | `2` | expõe 2 vCPUs à VM | limita builds e containers para preservar o host |
| `--memory` | `4` | aloca envelope de 4 GiB para a VM | reduz pressão de memória e paginação no macOS |
| `--disk` | `24` | limita disco de dados em GiB | impede crescimento silencioso do ambiente |
| `--arch` | `aarch64` | cria VM ARM64 | evita emulação completa em Apple Silicon |
| `--vm-type` | `vz` | usa Apple Virtualization.framework | caminho nativo e eficiente em macOS moderno |
| `--mount-type` | `virtiofs` | usa VirtIO-FS para compartilhamento | melhor integração para bind mounts em macOS recente |
| `--activate` | `true` | ativa o contexto Docker do Colima | faz `docker` apontar para o daemon correto |

Se você precisa executar muitos binários `amd64` dentro de imagens em Apple Silicon, teste Rosetta:

```bash
colima stop
colima delete --data --force

colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch aarch64 \
  --vm-type vz \
  --vz-rosetta \
  --mount-type virtiofs \
  --activate
```

Evite iniciar a VM inteira como `x86_64` em Apple Silicon, salvo necessidade real:

```bash
# Compatibilidade extrema, custo alto:
colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch x86_64 \
  --vm-type qemu \
  --mount-type 9p \
  --activate
```

Essa opção executa uma VM Intel em um host ARM. É funcional, mas tende a ser muito mais cara em CPU e I/O.

### 2.5. Inicialização recomendada para Macs Intel

Em Intel, use `x86_64`:

```bash
colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch x86_64 \
  --vm-type vz \
  --mount-type virtiofs \
  --activate
```

Se o macOS for antigo ou se `vz`/`virtiofs` não estiver disponível, use QEMU:

```bash
colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch x86_64 \
  --vm-type qemu \
  --mount-type 9p \
  --activate
```

### 2.6. Persistir configuração

O Colima permite editar a configuração declarativa antes da inicialização:

```bash
colima start --edit
```

Também é possível criar um template padrão:

```bash
colima template
```

Exemplo conceitual de configuração equivalente:

```yaml
cpu: 2
memory: 4
disk: 24
arch: aarch64
runtime: docker
vmType: vz
mountType: virtiofs
kubernetes:
  enabled: false
```

Evite habilitar Kubernetes local por padrão. Kubernetes adiciona k3s, imagens, volumes, rede e objetos persistentes. Em um padrão "zero bloatware", habilite somente em perfis específicos:

```bash
colima start kube \
  --runtime docker \
  --kubernetes \
  --cpu 4 \
  --memory 6 \
  --disk 32 \
  --arch aarch64 \
  --vm-type vz \
  --mount-type virtiofs
```

### 2.7. Contextos Docker e socket correto

Colima usa Docker contexts para coexistir com outros daemons. Depois do `colima start`, confira:

```bash
docker context ls
docker context show
docker context inspect colima --format '{{ .Endpoints.docker.Host }}'
```

O esperado em Colima moderno é algo como:

```text
unix:///Users/seu_usuario/.colima/default/docker.sock
```

Ativar explicitamente:

```bash
docker context use colima
```

Validar que o Docker está falando com a VM do Colima:

```bash
docker info --format 'Name={{.Name}} OS={{.OperatingSystem}} Arch={{.Architecture}} CPUs={{.NCPU}}'
```

Se a CLI continuar tentando usar `/var/run/docker.sock`, remova variáveis que sobrepõem o contexto:

```bash
unset DOCKER_HOST
unset DOCKER_CONTEXT
docker context use colima
```

Algumas IDEs e ferramentas antigas ignoram Docker contexts e exigem um socket explícito:

```bash
export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
```

Use essa variável apenas quando a ferramenta realmente precisar. `DOCKER_HOST` tem precedência operacional e pode confundir alternância entre contextos.

## 3. Cheat Sheet de Comandos Avançados e Manutenção de Espaço

### 3.1. Estado do Colima

| Objetivo | Comando | Observação |
| :-- | :-- | :-- |
| Ver instâncias | `colima list` | mostra perfil, status, arquitetura, CPU, memória e disco |
| Ver status do perfil padrão | `colima status` | mostra socket e detalhes do runtime |
| Iniciar | `colima start` | usa configuração persistida |
| Parar | `colima stop` | libera CPU/RAM, preserva disco |
| Reiniciar | `colima restart` | útil após mudar daemon config |
| Entrar na VM | `colima ssh` | acesso ao Linux guest |
| Executar comando na VM | `colima ssh -- df -h` | não abre shell interativo |
| Ver configuração SSH | `colima ssh-config` | útil para diagnósticos |
| Limpar downloads/cache do Colima | `colima prune` | remove assets baixados pelo Colima, não substitui prune do Docker |
| Destruir perfil | `colima delete --data --force` | remove VM e dados do runtime |

### 3.2. Diagnóstico de disco Docker

Resumo:

```bash
docker system df
```

Detalhado:

```bash
docker system df -v
```

Containers com tamanho gravado:

```bash
docker ps -a --size
```

Imagens ordenadas por tamanho aparente:

```bash
docker image ls --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.ID}}'
```

Volumes:

```bash
docker volume ls
docker volume inspect nome_do_volume
```

Disco dentro da VM:

```bash
colima ssh -- df -h
colima ssh -- sudo du -xh -d1 /var/lib/docker | sort -h
```

Build cache:

```bash
docker builder prune --help
docker buildx du 2>/dev/null || true
```

### 3.3. Prune diário, semanal e nuclear

Limpeza segura para o dia a dia:

```bash
docker system prune
```

Remove:

- containers parados;
- redes não usadas;
- imagens dangling;
- cache de build não usado.

Não remove, por padrão, imagens ainda referenciadas por tags nem volumes.

Limpeza mais agressiva:

```bash
docker system prune -a
```

Remove também imagens não usadas por nenhum container. Isso é importante: se uma imagem está apenas "guardada" localmente, mas nenhum container depende dela, ela pode ser removida. O próximo `docker run` ou `docker compose up` fará pull/build novamente.

Limpeza agressiva com volumes anônimos:

```bash
docker system prune -a --volumes
```

Impacto:

- remove tudo do `system prune -a`;
- remove volumes anônimos não usados;
- pode apagar dados locais que você esperava manter se o projeto usa volumes sem nome explícito.

Antes de usar `--volumes`, audite:

```bash
docker volume ls
docker container ls -a --format 'table {{.Names}}\t{{.Mounts}}'
```

Limpar apenas containers parados:

```bash
docker container prune
```

Limpar apenas imagens dangling:

```bash
docker image prune
```

Limpar todas as imagens não usadas:

```bash
docker image prune -a
```

Limpar redes não usadas:

```bash
docker network prune
```

Limpar volumes não usados:

```bash
docker volume prune
```

Em versões que suportam prune agressivo de volumes nomeados:

```bash
docker volume prune -a
```

Use esse comando como operação destrutiva. Volumes nomeados costumam armazenar bancos locais, filas, buckets S3 fake, índices de busca e dados que não existem em outro lugar.

### 3.4. BuildKit e cache de build

Ver espaço usado pelo Docker:

```bash
docker system df -v
```

Limpar cache dangling do builder:

```bash
docker builder prune
```

Limpar todo cache de build não usado:

```bash
docker builder prune -a
```

Limpar sem prompt:

```bash
docker builder prune -af
```

Manter um teto de cache:

```bash
docker builder prune --keep-storage 2GB
```

Limpar apenas caches mais antigos:

```bash
docker builder prune --filter until=24h
```

Combinação recomendada para rotina semanal:

```bash
docker builder prune --filter until=168h --keep-storage 2GB
```

Com Buildx:

```bash
docker buildx prune --filter until=168h --keep-storage 2GB
```

### 3.5. Botão de pânico: destruir e recriar limpo

Quando o ambiente local ficou inconsistente, pesado ou suspeito, a estratégia mais barata pode ser destruir a VM e recriar:

```bash
colima stop
colima delete --data --force

colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch aarch64 \
  --vm-type vz \
  --mount-type virtiofs \
  --activate

docker context use colima
docker system df
```

Para Intel, substitua:

```bash
--arch x86_64
```

Esse procedimento apaga containers, imagens, volumes e cache do runtime dentro do perfil Colima. Ele é intencionalmente destrutivo. Use backup para volumes importantes.

### 3.6. Rotina recomendada de manutenção

Diária:

```bash
docker system df
docker system prune
```

Semanal:

```bash
docker system prune -a
docker builder prune --filter until=168h --keep-storage 2GB
```

Mensal ou quando o SSD estiver pressionado:

```bash
docker system prune -a --volumes
colima prune
colima ssh -- df -h
```

Quando o ambiente deixou de ser confiável:

```bash
colima delete --data --force
```

## 4. Boas Práticas de Desenvolvimento e Curiosidades Técnicas

### 4.1. Curiosidade sobre imagens Alpine e Slim

O tamanho de uma imagem Docker é a soma de camadas. Uma imagem final não é um arquivo único; ela é um grafo de layers content-addressed.

Modelo simplificado:

```text
S_imagem = Σ S_layer_i
```

Para tráfego de rede, o que importa é o tamanho comprimido dos layers baixados:

```text
S_pull ~= Σ compressed(layer_i_ausente_no_host)
```

Para disco local, o que importa é o tamanho descomprimido e o compartilhamento entre imagens:

```text
S_local_incremental ~= Σ uncompressed(layer_i_nao_existente_no_content_store)
```

Por isso duas imagens de 300 MB podem não consumir 600 MB se compartilham layers base. E uma única imagem aparentemente pequena pode gerar muito disco durante build se o Dockerfile cria, modifica e remove arquivos em layers diferentes.

Comparação típica de famílias de base:

| Base | Ordem de grandeza comprimida | Ordem de grandeza descomprimida | Característica |
| :-- | --: | --: | :-- |
| `alpine` | 4 a 8 MiB | 8 a 15 MiB | musl libc, BusyBox, superfície mínima |
| `debian:bookworm-slim` | 25 a 40 MiB | 70 a 100 MiB | glibc, boa compatibilidade, menos pacotes |
| `ubuntu:24.04` | 25 a 45 MiB | 70 a 120 MiB | glibc, ecossistema amplo, base mais geral |
| imagens full de linguagem | centenas de MiB | até mais de 1 GiB | toolchains, headers, package managers e dependências de build |

Exemplo matemático com uma stack Python hipotética:

```text
python:full   = 1.020 MiB
python:slim   =   190 MiB
python:alpine =    70 MiB

economia_slim_vs_full   = (1020 - 190) / 1020 * 100 ~= 81,4%
economia_alpine_vs_full = (1020 -  70) / 1020 * 100 ~= 93,1%
```

Mas "menor" não significa sempre "melhor". Alpine usa `musl`, não `glibc`. Isso pode afetar:

- extensões nativas Python, Ruby, Node e PHP;
- dependências com wheels/prebuilds só para glibc;
- resolução DNS e diferenças sutis de libc;
- debug com ferramentas ausentes;
- performance de workloads específicos.

Regra prática:

| Caso | Base recomendada |
| :-- | :-- |
| binário Go estático | `scratch`, `distroless` ou `alpine` |
| Python com dependências científicas | `python:*-slim` ou Debian slim |
| Node com módulos nativos | `node:*-slim` antes de Alpine |
| imagem final de produção | multi-stage + base mínima |
| imagem de desenvolvimento | base um pouco maior pode economizar tempo humano |

Meça no seu ambiente:

```bash
docker pull alpine:3.20
docker pull debian:bookworm-slim
docker pull ubuntu:24.04

docker image ls alpine:3.20 debian:bookworm-slim ubuntu:24.04
docker image inspect alpine:3.20 --format '{{.Size}}'
```

Para ver manifestos multi-arch:

```bash
docker buildx imagetools inspect alpine:3.20
docker buildx imagetools inspect debian:bookworm-slim
```

### 4.2. Dockerfile econômico em disco

Um erro comum:

```dockerfile
FROM debian:bookworm
RUN apt-get update
RUN apt-get install -y build-essential curl git
RUN rm -rf /var/lib/apt/lists/*
```

Cada `RUN` cria uma layer. Se o cache do `apt` foi criado em uma layer anterior, removê-lo em layer posterior não elimina o custo histórico daquela layer.

Melhor:

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
```

Multi-stage:

```dockerfile
FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/app ./cmd/app

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/app /app
USER nonroot:nonroot
ENTRYPOINT ["/app"]
```

O estágio de build pode ter centenas de MiB. O estágio final pode ter poucos MiB, porque não carrega compilador, headers, cache de package manager nem código-fonte completo.

### 4.3. `.dockerignore` é controle de dano

Sem `.dockerignore`, o Docker envia o build context inteiro ao daemon dentro da VM. Isso custa CPU, I/O, rede local entre host e VM, cache e disco.

Exemplo mínimo:

```dockerignore
.git
.github
.idea
.vscode
node_modules
dist
build
coverage
.pytest_cache
.mypy_cache
.next
.nuxt
tmp
*.log
*.tgz
*.zip
.DS_Store
```

Medir o contexto enviado:

```bash
docker build --progress=plain -t app:dev .
```

Procure no output por linhas de transferência de contexto.

### 4.4. Gerenciamento de cache de build

BuildKit armazena cache no data-root do Docker, dentro da VM:

```text
/var/lib/docker/buildkit
/var/lib/docker/containerd
```

Esse cache acelera builds repetidos, mas cresce com:

- mudanças frequentes em Dockerfiles;
- builds multi-stage;
- `RUN` que baixa dependências;
- múltiplas branches;
- imagens multi-arch;
- builds com argumentos variáveis;
- contexts grandes.

Build limpo, ignorando cache anterior:

```bash
DOCKER_BUILDKIT=1 docker build --no-cache --pull -t app:dev .
```

Importante: `--no-cache` não significa "não cria cache novo". Ele significa "não reutiliza cache anterior". O build resultante ainda pode gerar novas layers e novo cache. Se a intenção é limpar depois:

```bash
DOCKER_BUILDKIT=1 docker build --no-cache --pull -t app:dev .
docker builder prune -f
```

Para invalidar apenas um estágio específico:

```bash
docker build --no-cache-filter install -t app:dev .
```

Para builds com cache controlado:

```bash
docker builder prune --filter until=24h --keep-storage 2GB
```

Em CI local ou scripts de benchmark:

```bash
docker builder prune -af
docker build --pull --no-cache -t app:benchmark .
docker image rm app:benchmark
docker builder prune -af
```

Para dependências de package manager, prefira cache mounts do BuildKit em vez de gravar cache permanente na imagem final:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
  pip install --prefix=/install -r requirements.txt
```

O cache mount acelera rebuilds, mas permanece como cache do builder. Portanto, ele também entra na política de `docker builder prune`.

### 4.5. Montagem de volumes eficiente: APFS para Linux VM

Bind mounts entre macOS e containers atravessam esta fronteira:

```text
APFS no macOS -> mecanismo de compartilhamento da VM -> filesystem Linux guest -> container
```

Esse caminho é mais caro do que acessar arquivos nativos dentro da VM. A diferença aparece em workloads com muitas operações de metadados:

- `npm install`;
- `pnpm install`;
- `composer install`;
- `bundle install`;
- `pip install` com muitos arquivos;
- watchers de frontend;
- bancos de dados;
- índices de busca;
- filas locais.

Mecanismos relevantes:

| Mecanismo | Onde aparece | Característica |
| :-- | :-- | :-- |
| `virtiofs` | Lima/Colima com `vm-type vz` em macOS recente | melhor caminho geral para compartilhamento host-guest |
| `sshfs` ou reverse SSHFS | compatibilidade ampla | pode ter maior overhead e comportamento diferente em eventos |
| `9p` | QEMU/Lima | útil como fallback, mas sensível a compatibilidade e performance |

Recomendação para Colima moderno:

```bash
colima start \
  --vm-type vz \
  --mount-type virtiofs \
  --arch aarch64
```

Evite colocar dados de banco em bind mount do host:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Evite:

```yaml
services:
  postgres:
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
```

O primeiro exemplo grava em volume Docker dentro da VM, normalmente mais rápido e consistente para I/O Linux. O segundo força o banco a operar sobre uma ponte APFS -> VM -> container, o que pode custar performance, gerar problemas de permissões e amplificar consumo de disco no host.

Para dependências de desenvolvimento, prefira volumes nomeados:

```yaml
services:
  app:
    build: .
    volumes:
      - .:/workspace
      - node_modules:/workspace/node_modules
      - go_pkg_mod:/go/pkg/mod
      - go_build_cache:/root/.cache/go-build

volumes:
  node_modules:
  go_pkg_mod:
  go_build_cache:
```

Essa composição mantém o código-fonte sincronizado com o host, mas coloca diretórios volumosos e mutáveis dentro do filesystem Linux da VM.

### 4.6. Logs também consomem disco

O driver `json-file` pode crescer silenciosamente. Para desenvolvimento local, configure rotação:

```yaml
services:
  app:
    image: app:dev
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Ou no daemon Docker do Colima, via `colima start --edit`, configure:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Depois:

```bash
colima restart
```

### 4.7. Política de imagens para times

Padrões recomendados:

1. Use tags explícitas, não `latest`.
2. Use imagens multi-arch quando houver Apple Silicon no time.
3. Prefira `slim` para compatibilidade e economia.
4. Use Alpine quando a aplicação for compatível com `musl`.
5. Use multi-stage para remover toolchains da imagem final.
6. Remova caches de package manager na mesma layer em que foram criados.
7. Use `.dockerignore` agressivo.
8. Coloque bancos e caches em volumes nomeados.
9. Rode `docker system df` antes de culpar o SSD.
10. Destrua e recrie Colima quando o custo de investigação superar o custo de rebuild.

## 5. Resumo Executivo para Documentação de Projetos (README.md)

Bloco pronto para uso em projetos:

~~~markdown
## Ambiente Docker local no macOS com Colima

Este projeto recomenda Colima em vez de Docker Desktop para reduzir consumo de CPU, memória e disco no macOS.

### Instalação

```bash
brew install docker colima
```

Não instale o Docker Desktop via Cask para este padrão:

```bash
# Evite:
brew install --cask docker
```

Se o projeto usar `docker compose` e o plugin não estiver disponível:

```bash
brew install docker-compose
mkdir -p ~/.docker/cli-plugins
ln -sfn "$(brew --prefix)/opt/docker-compose/bin/docker-compose" \
  ~/.docker/cli-plugins/docker-compose
```

### Inicialização Apple Silicon

```bash
colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch aarch64 \
  --vm-type vz \
  --mount-type virtiofs \
  --activate
```

### Inicialização Intel

```bash
colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch x86_64 \
  --vm-type vz \
  --mount-type virtiofs \
  --activate
```

### Contexto Docker

```bash
docker context use colima
docker context show
docker info
```

Se alguma ferramenta não reconhecer Docker contexts:

```bash
export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"
```

### Uso diário

```bash
docker compose up --build
docker system df
```

### Limpeza

```bash
docker system prune
docker builder prune --filter until=168h --keep-storage 2GB
```

Limpeza agressiva:

```bash
docker system prune -a --volumes
```

Recriação total do ambiente local:

```bash
colima stop
colima delete --data --force
colima start \
  --runtime docker \
  --cpu 2 \
  --memory 4 \
  --disk 24 \
  --arch aarch64 \
  --vm-type vz \
  --mount-type virtiofs \
  --activate
```

Volumes Docker podem conter bancos locais e dados de desenvolvimento. Faça backup antes de usar `--volumes` ou `colima delete --data`.
~~~

## Referências técnicas

- Docker Desktop para Mac: FAQ sobre armazenamento de containers, imagens e arquivo de disco virtual: [docs.docker.com/desktop/troubleshoot-and-support/faqs/macfaqs](https://docs.docker.com/desktop/troubleshoot-and-support/faqs/macfaqs/)
- Docker Desktop VMM no macOS: Docker VMM, Apple Virtualization.framework, QEMU legado e HyperKit legado: [docs.docker.com/desktop/features/vmm](https://docs.docker.com/desktop/features/vmm/)
- Docker contexts: [docs.docker.com/engine/manage-resources/contexts](https://docs.docker.com/engine/manage-resources/contexts/)
- `docker system prune`: [docs.docker.com/reference/cli/docker/system/prune](https://docs.docker.com/reference/cli/docker/system/prune/)
- `docker builder prune`: [docs.docker.com/reference/cli/docker/builder/prune](https://docs.docker.com/reference/cli/docker/builder/prune/)
- Build cache invalidation no Docker BuildKit: [docs.docker.com/build/cache/invalidation](https://docs.docker.com/build/cache/invalidation/)
- Colima: container runtimes on macOS with minimal setup: [github.com/abiosoft/colima](https://github.com/abiosoft/colima)
- Colima FAQ: Docker contexts e socket location: [github.com/abiosoft/colima/blob/main/docs/FAQ.md](https://github.com/abiosoft/colima/blob/main/docs/FAQ.md)
- Lima VM types: `vz`, `qemu` e seleção por arquitetura: [lima-vm.io/docs/config/vmtype](https://lima-vm.io/docs/config/vmtype/)
- Lima filesystem mounts: `sshfs`, `9p` e `virtiofs`: [lima-vm.io/docs/config/mount](https://lima-vm.io/docs/config/mount/)
- Lima multi-arch: emulação de arquitetura estrangeira: [lima-vm.io/docs/config/multi-arch](https://lima-vm.io/docs/config/multi-arch/)
- Apple Virtualization.framework: [developer.apple.com/documentation/virtualization](https://developer.apple.com/documentation/virtualization)

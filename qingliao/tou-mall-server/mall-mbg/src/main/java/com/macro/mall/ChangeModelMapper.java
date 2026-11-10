package com.macro.mall;

import java.io.BufferedWriter;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Created by oahnus on 2025/5/29
 *
 * @author oahnus
 */
public class ChangeModelMapper {
    // 目标泛型模板
    private static final String GENERIC_TEMPLATE = " extends BaseMapper<%s>";
    // 需要添加的import语句
    private static final String IMPORT_STATEMENT = "import com.baomidou.mybatisplus.core.mapper.BaseMapper;";

    /**
     * 入口方法
     * @param targetDir 目标目录路径
     */
    public static void modifyDirectory(String targetDir) throws IOException {
        processDirectory(new File(targetDir));
    }

    private static void processDirectory(File dir) throws IOException {
        File[] files = dir.listFiles((d, name) ->
                name.endsWith(".java") || d.isDirectory()
        );

        if (files == null) return;

        for (File file : files) {
            if (file.isDirectory()) {
                processDirectory(file);
            } else {
                processJavaFile(file.toPath());
            }
        }
    }

    /**
     * 处理单个Java文件
     */
    private static void processJavaFile(Path filePath) throws IOException {
        List<String> lines = Files.readAllLines(filePath, StandardCharsets.UTF_8);
        List<String> modifiedLines = new ArrayList<>();
        boolean isInterfaceProcessed = false;
        boolean hasBaseMapperImport = false;

        for (String line : lines) {
            // 处理接口定义行
            if (!isInterfaceProcessed && line.contains(" interface ")) {
                modifiedLines.add(processInterfaceLine(line));
                isInterfaceProcessed = true;
                continue;
            }

            // 检查已有import
            if (line.trim().equals(IMPORT_STATEMENT)) {
                hasBaseMapperImport = true;
            }

            modifiedLines.add(line);
        }

        // 添加缺失的import
        if (!hasBaseMapperImport) {
            addImportStatement(modifiedLines);
        }

        // 回写文件（使用临时文件保证原子性）
        writeModifiedFile(filePath, modifiedLines);
    }

    /**
     * 处理接口行（核心逻辑）[3,5](@ref)
     */
    private static String processInterfaceLine(String originalLine) {
        // 提取接口名称
        String interfaceName = originalLine
                .replace("public", "")
                .replace("interface", "")
                .trim()
                .split("[<{]")[0];

        // 生成泛型类型
        String genericType = interfaceName.replace("Mapper", "");
        genericType = genericType.trim();
        String genericAddition = String.format(GENERIC_TEMPLATE, genericType);

        // 处理已有extends语句
        if (originalLine.contains(" extends ")) {
            return originalLine.replace(" extends ", genericAddition + " extends ");
        }

        // 处理没有extends的情况
        int braceIndex = originalLine.indexOf("{");
        if (braceIndex != -1) {
            return originalLine.substring(0, braceIndex) +
                    genericAddition +
                    originalLine.substring(braceIndex);
        }
        return originalLine + genericAddition;
    }

    /**
     * 插入import语句（智能定位package之后）[8](@ref)
     */
    private static void addImportStatement(List<String> lines) {
        int insertPosition = -1;
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            if (line.startsWith("package ")) {
                insertPosition = i + 1;
            }
            if (insertPosition != -1 && !line.startsWith("import ")) {
                break;
            }
        }
        lines.add(insertPosition, IMPORT_STATEMENT);
    }

    /**
     * 安全写入文件（通过临时文件保证数据完整性）[1,4](@ref)
     */
    private static void writeModifiedFile(Path path, List<String> lines) throws IOException {
        Path tempPath = Paths.get(path + ".tmp");
        try (BufferedWriter writer = Files.newBufferedWriter(tempPath, StandardCharsets.UTF_8)) {
            for (String line : lines) {
                writer.write(line);
                writer.newLine();
            }
        }
        Files.move(tempPath, path, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    public static void run1() {
        try {
            // 示例用法
            modifyDirectory("D:\\Zhijia Projects\\touliao\\mall\\mall-mbg\\src\\main\\java\\com\\macro\\mall\\mapper");
            System.out.println("接口改造完成");
        } catch (IOException e) {
            System.err.println("处理过程中发生错误: " + e.getMessage());
            e.printStackTrace();
        }
    }






    // 排除类正则（参考网页10的命名规范）
    private static final Pattern EXCLUDE_CLASS_PAT =
            Pattern.compile("class\\s+\\w+Example(\\s+|\\{)");

    // 类声明正则（支持带泛型的情况）
    private static final Pattern CLASS_DECL_PAT =
            Pattern.compile("(\\s*)(public\\s+class\\s+\\w+)");

    // Getter/Setter方法正则（参考网页10的多行匹配）
    private static final Pattern GETTER_SETTER_PAT =
            Pattern.compile("^\\s*@?\\w*\\s*(public|protected|private)?\\s+[\\w<>]+\\s+(get|set)\\w+\\s*[^)]*\\s*\\{.*?^\\s*}\\s*$",
                    Pattern.MULTILINE | Pattern.DOTALL);

    // Lombok注解检测
    private static final Pattern DATA_ANNOTATION_PAT =
            Pattern.compile("@Data\\s*");

    public static void processDirectory(String dirPath) throws IOException {
        Files.walk(Paths.get(dirPath))
                .filter(p -> p.toString().endsWith(".java"))
                .filter(p -> !isExcludedClass(p))
                .forEach(p -> {
                    try {
                        processFile(p);
                    } catch (IOException e) {
                        System.err.println("处理失败: " + p);
                    }
                });
    }

    // 排除类检查（参考网页3的过滤逻辑）
    private static boolean isExcludedClass(Path path)  {
        String content = "";
        try {
            content = new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
        return EXCLUDE_CLASS_PAT.matcher(content).find();
    }

    private static void processFile(Path file) throws IOException {
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        List<String> newLines = new ArrayList<>();
        boolean hasData = false;
        boolean hasLombokImport = false;

        // 第一遍处理：检查现有配置
        for (String line : lines) {
            if (DATA_ANNOTATION_PAT.matcher(line).find()) hasData = true;
            if (line.trim().equals("import lombok.Data;")) hasLombokImport = true;
        }

        // 第二遍处理：修改内容
        boolean classProcessed = false;
        for (String line : lines) {
            // 添加@Data注解（参考网页3的静态方法）
            if (!classProcessed && line.contains("public class")) {
                if (!hasData) {
                    newLines.add(line.replaceAll(
                            CLASS_DECL_PAT.pattern(),
                            "$1@Data\n$1$2"
                    ));
                } else {
                    newLines.add(line);
                }
                classProcessed = true;
                continue;
            }

            // 跳过需要删除的方法
            if (GETTER_SETTER_PAT.matcher(line).find()) continue;

            newLines.add(line);
        }

        // 添加Lombok导入（参考网页3的import处理）
        if (!hasLombokImport && !hasData) {
            int insertPos = findImportPosition(newLines);
            newLines.add(insertPos, "import lombok.Data;");
        }

        // 原子化写入（参考网页6的安全写入）
        writeFileSafely(file, String.join("\n", newLines));
    }

    // 定位import插入位置（参考网页3的代码结构）
    private static int findImportPosition(List<String> lines) {
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).startsWith("package ")) {
                while (++i < lines.size()) {
                    if (!lines.get(i).startsWith("import "))
                        return i;
                }
            }
        }
        return 0;
    }

    // 安全写入方法（参考网页6的原子操作）
    private static void writeFileSafely(Path path, String content) throws IOException {
        Path tempFile = Files.createTempFile(path.getParent(), "tmp", ".java");
        Files.write(tempFile, content.getBytes(StandardCharsets.UTF_8));
        Files.move(tempFile, path, StandardCopyOption.REPLACE_EXISTING);
    }

    // 修改所有model 删除get,set 添加@Data
    public static void run2() {
        try {
            processDirectory("D:\\Zhijia Projects\\touliao\\mall\\mall-mbg\\src\\main\\java\\com\\macro\\mall\\model");
            System.out.println("处理完成");
        } catch (IOException e) {
            System.err.println("错误: " + e.getMessage());
        }
    }

    public static void main(String... args) {
//        run1();
        run2();
    }
}

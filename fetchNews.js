const fs = require("fs");
const { JSDOM } = require("jsdom");

function fetchNews(news, newsPaperPath) {
  const htmlString = fs.readFileSync(newsPaperPath).toString();
  const { document } = new JSDOM(htmlString).window;
  const newsPaperHeading = document.querySelector("h1").textContent.trim();
  const newsPaperName = newsPaperHeading.split(" | ")[0];
  const newsPaperDate = newsPaperHeading.split(" | ")[1];
  const newsCategories = document.querySelectorAll("nav#TOC > ul > li");
  var newsArticles = document.querySelectorAll("h2");
  var index = 0;

  news[newsPaperDate] = {
    articleList: [],
    articleFilePath: {},
    categories: {},
    categoryList: [],
  };

  for (category of newsCategories) {
    const categoryName = category.firstChild.childNodes[1].nodeValue
      .trim()
      .toLowerCase();
    const articles = category.childNodes[1].querySelectorAll("li");

    const directory = `./News/${newsPaperName}/${newsPaperDate}/${categoryName}`;
    if (!fs.existsSync(directory)) {
      try {
        fs.mkdirSync(directory, { recursive: true });
        news[newsPaperDate]["categories"][categoryName] = {
          articleList: [],
          articleFilePath: {},
        };
        news[newsPaperDate]["categoryList"].push(categoryName);
      } catch (error) {
        console.log("error while creating directory. dirname = " + directory);
        continue;
      }
    }

    for (const article of articles) {
      const articleName = article.firstChild.childNodes[1].nodeValue.trim();
      var articleText = "";

      const filePath = directory + `/${index}.txt`;
      const currentArticle = newsArticles[index];
      var p = currentArticle.nextSibling.nextSibling;

      while (p.firstChild.nodeName != "A") {
        articleText += p.textContent;
        p = p.nextSibling.nextSibling;
      }
      try {
        fs.writeFileSync(filePath, articleText);
        news[newsPaperDate]["categories"][categoryName]["articleFilePath"][
          articleName
        ] = filePath;
        news[newsPaperDate]["categories"][categoryName]["articleList"].push(
          articleName
        );
        news[newsPaperDate]["articleFilePath"][articleName] = filePath;
        news[newsPaperDate]["articleList"].push(articleName);
      } catch (e) {
        console.log("file not saved.but fileName = " + articleName);
      }
      index += 1;
    }
  }
}

module.exports = { fetchNews };
